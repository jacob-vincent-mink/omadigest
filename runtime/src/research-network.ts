import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isPublicAddress } from "./connector-network.js";

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_DOCUMENT_CHARS = 24_000;
const MAX_SEARCH_RESULTS = 8;
const TIMEOUT_MS = 12_000;

export type ResearchSearchResult = { title: string; url: string; snippet: string; publishedAt?: string };
export type ResearchDocument = {
  url: string;
  title: string;
  text: string;
  retrievedAt: string;
  publishedAt?: string;
  updatedAt?: string;
  excerptHash: string;
};

export async function searchResearchWeb(query: string): Promise<ResearchSearchResult[]> {
  const boundedQuery = query.trim().slice(0, 500);
  if (boundedQuery.length < 2) throw new Error("A research search needs a more specific query");
  const urls = [
    `https://www.bing.com/news/search?q=${encodeURIComponent(boundedQuery)}&format=rss`,
    `https://www.bing.com/search?q=${encodeURIComponent(boundedQuery)}&format=rss`
  ];
  const responses = await Promise.allSettled(urls.map((url) => boundedHttpsGet(url)));
  const successful = responses.flatMap((response, index) => response.status === "fulfilled"
    && response.value.status >= 200 && response.value.status < 300
    ? [{ response: response.value, trustPublishedAt: index === 0 }] : []);
  if (successful.length === 0) throw new Error("Research search did not return a usable response");
  const results = successful.flatMap(({ response, trustPublishedAt }) =>
    parseResearchSearchFeed(response.body, trustPublishedAt));
  return [...new Map(results.map((result) => [result.url, result])).values()].slice(0, MAX_SEARCH_RESULTS);
}

export function parseResearchSearchFeed(body: string, trustPublishedAt = false): ResearchSearchResult[] {
  const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/giu)].slice(0, MAX_SEARCH_RESULTS);
  return items.flatMap((match) => {
    const item = match[1] ?? "";
    const title = decodeEntities(xmlValue(item, "title")).replaceAll(/\s+/gu, " ").trim().slice(0, 200);
    const rawUrl = canonicalSearchResultUrl(decodeEntities(xmlValue(item, "link")).trim());
    const snippet = stripMarkup(decodeEntities(xmlValue(item, "description"))).slice(0, 600);
    const publishedAt = trustPublishedAt ? normalizedDate(xmlValue(item, "pubDate")) : undefined;
    try {
      const safeUrl = validateResearchUrl(rawUrl).toString();
      return title && snippet ? [{ title, url: safeUrl, snippet, ...(publishedAt ? { publishedAt } : {}) }] : [];
    } catch { return []; }
  });
}

function canonicalSearchResultUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname === "www.bing.com" && parsed.pathname === "/news/apiclick.aspx")
      return parsed.searchParams.get("url") ?? rawUrl;
  } catch { /* rejected by validateResearchUrl */ }
  return rawUrl;
}

export async function readResearchUrl(rawUrl: string): Promise<ResearchDocument> {
  const response = await boundedHttpsGet(validateResearchUrl(rawUrl).toString());
  if (response.status < 200 || response.status >= 300) throw new Error(`Research source returned HTTP ${response.status}`);
  const contentType = response.contentType.toLowerCase();
  if (!["text/", "application/json", "application/xml", "application/rss+xml", "application/atom+xml", "application/xhtml+xml"]
    .some((allowed) => contentType.startsWith(allowed))) throw new Error("Research source did not return readable text");
  const title = extractTitle(response.body, response.url);
  const text = contentType.includes("json")
    ? readableJson(response.body) : stripMarkup(response.body);
  if (text.length < 20) throw new Error("Research source did not contain enough readable text");
  const bounded = text.slice(0, MAX_DOCUMENT_CHARS);
  const publishedAt = extractPublishedAt(response.body);
  const updatedAt = normalizedDate(response.lastModified);
  return {
    url: response.url,
    title,
    text: bounded,
    retrievedAt: new Date().toISOString(),
    ...(publishedAt ? { publishedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    excerptHash: createHash("sha256").update(bounded).digest("hex")
  };
}

export function validateResearchUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("Research sources must be credential-free HTTPS URLs without fragments");
  if (url.hostname.length > 253) throw new Error("Research source hostname is too long");
  return url;
}

async function boundedHttpsGet(rawUrl: string, redirects = 0): Promise<{
  status: number; body: string; contentType: string; url: string; lastModified: string;
}> {
  const url = validateResearchUrl(rawUrl);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address)))
    throw new Error("Research source resolved to a private or non-routable address");
  const selected = addresses[0]!;
  return new Promise((resolveRequest, rejectRequest) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      rejectRequest(error);
    };
    const request = httpsRequest(url, {
      method: "GET",
      headers: { accept: "text/html, application/rss+xml, application/atom+xml, application/json, text/plain", "user-agent": "OmaDigest-Research/0.1" },
      lookup: createPinnedLookup(selected.address, selected.family === 6 ? 6 : 4)
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location !== undefined) {
        response.resume();
        if (redirects >= 2) { fail(new Error("Research source redirected too many times")); return; }
        let redirect: URL;
        try { redirect = validateResearchUrl(new URL(location, url).toString()); }
        catch { fail(new Error("Research source redirected to an unsafe URL")); return; }
        settled = true;
        void boundedHttpsGet(redirect.toString(), redirects + 1).then(resolveRequest, rejectRequest);
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) { request.destroy(new Error("Research source exceeded the byte limit")); return; }
        chunks.push(buffer);
      });
      response.once("error", fail);
      response.once("end", () => {
        if (settled) return;
        settled = true;
        resolveRequest({
          status, body: Buffer.concat(chunks, bytes).toString("utf8"),
          contentType: String(response.headers["content-type"] ?? "text/plain").split(";", 1)[0] ?? "text/plain",
          url: url.toString(), lastModified: String(response.headers["last-modified"] ?? "")
        });
      });
    });
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error("Research source timed out")));
    request.once("error", fail);
    request.end();
  });
}

export function createPinnedLookup(address: string, family: 4 | 6): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address, family }]);
    else callback(null, address, family);
  };
}

function xmlValue(xml: string, name: string): string {
  return new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`, "iu").exec(xml)?.[1] ?? "";
}

function extractTitle(body: string, url: string): string {
  const raw = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/iu.exec(body)?.[1]
    ?? /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/iu.exec(body)?.[1];
  if (raw !== undefined) {
    const title = stripMarkup(raw).slice(0, 200);
    if (title) return title;
  }
  return new URL(url).hostname.slice(0, 200);
}

function extractPublishedAt(body: string): string | undefined {
  for (const match of body.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1]?.toLowerCase();
    if (!["article:published_time", "date", "datepublished", "publish-date", "pubdate"].includes(key ?? "")) continue;
    const value = /content\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1];
    const normalized = normalizedDate(value ?? "");
    if (normalized) return normalized;
  }
  const structured = /["']datePublished["']\s*:\s*["']([^"']+)["']/iu.exec(body)?.[1];
  const time = /<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/iu.exec(body)?.[1];
  return normalizedDate(structured ?? time ?? "");
}

function normalizedDate(value: string): string | undefined {
  const timestamp = Date.parse(decodeEntities(value).trim());
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function stripMarkup(value: string): string {
  return decodeEntities(value
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replaceAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/giu, " ")
    .replaceAll(/<[^>]+>/gu, " "))
    .replaceAll(/\s+/gu, " ").trim();
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return value.replaceAll(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, entity: string) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? whole;
  });
}

function readableJson(value: string): string {
  try { return JSON.stringify(JSON.parse(value)); }
  catch { return value.replaceAll(/\s+/gu, " ").trim(); }
}
