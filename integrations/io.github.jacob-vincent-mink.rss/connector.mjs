#!/usr/bin/env node
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONNECTOR_ID = "io.github.jacob-vincent-mink.rss";
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 50;
const MAX_PARSED_ENTRIES = 500;

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

export async function handle(request, dependencies = {}) {
  validateRequest(request);
  if (request.type === "shutdown") return false;
  if (request.type !== "probe" && request.type !== "setup" && request.type !== "sync") throw new ConnectorError("unsupported_operation", "This connector supports probe, setup, and sync.");
  const config = parseConfig(request.config);
  const raw = await fetchFeed(config.url, dependencies.fetchImpl || fetch, dependencies.lookupImpl || lookup);
  const entries = parseFeed(raw, config.url);
  if (request.type === "probe" || request.type === "setup") {
    emit({ version: 1, type: "status", id: request.id, state: "ready", message: `Feed connected${entries.length ? ` · ${entries.length} bounded entries detected` : ""}` });
    return true;
  }
  const items = normalizeEntries(entries, config.keywords, request.since, request.until, request.limit);
  emit({ version: 1, type: "items", id: request.id, items, nextCursor: null });
  return true;
}

export function parseFeed(raw, baseUrl) {
  const source = String(raw || "");
  if (Buffer.byteLength(source) > MAX_FEED_BYTES) throw new ConnectorError("source_too_large", "The feed is too large.");
  if (/<!DOCTYPE|<!ENTITY/iu.test(source)) throw new ConnectorError("source_invalid", "DTD and custom entity declarations are not supported.");
  const blocks = [...source.matchAll(/<(?:[A-Za-z0-9_-]+:)?(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?(?:item|entry)>/giu)].slice(0, MAX_PARSED_ENTRIES);
  return blocks.flatMap((match, index) => {
    const block = match[1];
    const title = xmlText(firstTag(block, ["title"]), 4_000);
    const date = parseDate(xmlText(firstTag(block, ["published", "updated", "pubDate", "dc:date"]), 200));
    const guid = xmlText(firstTag(block, ["id", "guid"]), 1_000);
    const summary = xmlText(firstTag(block, ["summary", "description", "content", "content:encoded"]), 8_000);
    const link = entryLink(block, baseUrl);
    if (!title || !date) return [];
    const sourceId = guid || link || `${title}\n${date}`;
    return [{ sourceId: bounded(sourceId, 2_000), title, summary, occurredAt: date, link, index }];
  });
}

export function normalizeEntries(entries, keywords, sinceValue, untilValue, limit = MAX_ITEMS) {
  const since = boundaryMs(sinceValue, -Infinity); const until = boundaryMs(untilValue, Infinity); const result = [];
  for (const entry of entries.slice(0, MAX_PARSED_ENTRIES)) {
    const time = Date.parse(entry.occurredAt); if (time < since || time > until) continue;
    const digest = createHash("sha256").update(entry.sourceId).digest("hex").slice(0, 32);
    const derived = `rss:entry:${digest}`;
    const common = { connector: CONNECTOR_ID, kind: "feed-entry", occurredAt: entry.occurredAt, title: bounded(entry.title, 2_000), body: bounded(entry.summary, 8_000), ...(entry.link ? { url: entry.link } : {}), sensitivity: "public", derivedFrom: [derived] };
    result.push({ id: derived, category: "new-entries", ...common });
    const haystack = `${entry.title}\n${entry.summary}`.toLocaleLowerCase("en-US");
    const matches = keywords.filter((keyword) => haystack.includes(keyword.toLocaleLowerCase("en-US")));
    if (matches.length) result.push({ id: `rss:priority:${digest}`, category: "priority-keywords", ...common, body: bounded(`Matched: ${matches.join(", ")} · ${entry.summary}`, 8_000) });
  }
  return fitItems(result.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)), boundedLimit(limit));
}

async function fetchFeed(initial, fetchImpl, lookupImpl) {
  let url = new URL(initial.href);
  for (let redirect = 0; redirect <= 2; redirect += 1) {
    await assertPublicHost(url, lookupImpl);
    let response;
    try { response = await fetchImpl(url, { headers: { accept: "application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9" }, redirect: "manual", signal: AbortSignal.timeout(10_000) }); }
    catch (error) { throw new ConnectorError(error?.name === "TimeoutError" ? "source_timeout" : "source_unavailable", "The feed could not be reached."); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirect === 2) throw new ConnectorError("unsafe_redirect", "The feed redirected too many times.");
      const location = response.headers.get("location"); if (!location) throw new ConnectorError("source_invalid", "The feed returned an invalid redirect.");
      const next = safeFeedUrl(new URL(location, url)); if (next.origin !== initial.origin) throw new ConnectorError("unsafe_redirect", "The feed redirected to a different host."); url = next; continue;
    }
    if (!response.ok) { const code = response.status === 401 || response.status === 403 ? "authentication_required" : response.status === 429 ? "rate_limited" : "source_unavailable"; throw new ConnectorError(code, code === "authentication_required" ? "The feed requires unsupported authentication." : `The feed returned ${response.status}.`); }
    return readBoundedText(response);
  }
  throw new ConnectorError("source_unavailable", "The feed could not be fetched.");
}
async function readBoundedText(response) {
  const length = Number(response.headers.get("content-length") || 0); if (length > MAX_FEED_BYTES) throw new ConnectorError("source_too_large", "The feed is too large.");
  if (!response.body) return ""; const reader = response.body.getReader(); const chunks = []; let total = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > MAX_FEED_BYTES) { await reader.cancel(); throw new ConnectorError("source_too_large", "The feed is too large."); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const joined = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}
async function assertPublicHost(url, lookupImpl) {
  if (obviouslyPrivateHost(url.hostname)) throw new ConnectorError("invalid_setup", "Feed URLs must use a public internet host.");
  let addresses;
  try { addresses = await lookupWithTimeout(url.hostname, lookupImpl); }
  catch { throw new ConnectorError("source_unavailable", "The feed host could not be resolved."); }
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((entry) => privateAddress(entry?.address))) throw new ConnectorError("invalid_setup", "Feed URLs must resolve only to public internet addresses.");
}
function lookupWithTimeout(hostname, lookupImpl) { return new Promise((resolveLookup, rejectLookup) => { const timer = setTimeout(() => rejectLookup(new Error("timeout")), 2_000); timer.unref(); Promise.resolve(lookupImpl(hostname, { all: true, verbatim: true })).then((value) => { clearTimeout(timer); resolveLookup(value); }, (error) => { clearTimeout(timer); rejectLookup(error); }); }); }
export function safeFeedUrl(value) { let url; try { url = value instanceof URL ? new URL(value.href) : new URL(String(value || "")); } catch { throw new ConnectorError("invalid_setup", "Enter a valid feed URL."); } if (url.protocol !== "https:" || url.username || url.password || url.port) throw new ConnectorError("invalid_setup", "Feed URLs must use credential-free HTTPS on the default port."); if (obviouslyPrivateHost(url.hostname)) throw new ConnectorError("invalid_setup", "Feed URLs must use a public internet host."); url.hash = ""; if (url.href.length > 2_048) throw new ConnectorError("invalid_setup", "The feed URL is too long."); return url; }
function parseConfig(config) { const url = safeFeedUrl(config?.feed_url); const keywords = [...new Set(String(config?.priority_keywords || "").split(",").map((value) => bounded(value, 40)).filter((value) => value.length >= 2).slice(0, 10))]; return { url, keywords }; }
function firstTag(block, names) { for (const name of names) { const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "iu").exec(block); if (match) return match[1]; } return ""; }
function entryLink(block, baseUrl) { for (const atom of block.matchAll(/<(?:[A-Za-z0-9_-]+:)?link\b([^>]*)\/?\s*>/giu)) { const rel = /\brel\s*=\s*["']([^"']+)["']/iu.exec(atom[1])?.[1]; const href = /\bhref\s*=\s*["']([^"']+)["']/iu.exec(atom[1])?.[1]; if (href && (!rel || rel === "alternate")) return safeEntryUrl(decodeEntities(href), baseUrl); } return safeEntryUrl(xmlText(firstTag(block, ["link"]), 2_048), baseUrl); }
function xmlText(value, length) { return bounded(decodeEntities(String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1").replace(/<[^>]{0,500}>/gu, " ")), length); }
function decodeEntities(value) { return value.replace(/&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/giu, (entity) => { const named = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }; const lower = entity.toLowerCase(); if (named[lower]) return named[lower]; const number = lower.startsWith("&#x") ? Number.parseInt(lower.slice(3, -1), 16) : Number.parseInt(lower.slice(2, -1), 10); return Number.isInteger(number) && number >= 32 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : " "; }); }
function safeEntryUrl(raw, base) { if (!raw) return undefined; try { const url = new URL(raw, base); if (url.protocol !== "https:" || url.username || url.password || obviouslyPrivateHost(url.hostname)) return undefined; url.hash = ""; return url.href.slice(0, 2_048); } catch { return undefined; } }
function obviouslyPrivateHost(host) { const value = String(host || "").toLowerCase().replace(/^\[|\]$/gu, ""); return value === "localhost" || value.endsWith(".localhost") || value.endsWith(".local") || value.endsWith(".internal") || isIP(value) > 0 && privateAddress(value); }
function privateAddress(address) { const value = String(address || "").toLowerCase(); if (value === "::1" || value === "::" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true; const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(value); if (!match) return value.startsWith("::ffff:") ? privateAddress(value.slice(7)) : false; const [a, b] = [Number(match[1]), Number(match[2])]; return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127; }
function parseDate(value) { const date = new Date(String(value || "")); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
function validateRequest(value) { if (value?.version !== 1 || typeof value.id !== "string" || value.id.length > 240) throw new ConnectorError("invalid_request", "Invalid connector request."); }
function bounded(value, length) { return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, length); }
function boundedLimit(value) { return Math.max(1, Math.min(MAX_ITEMS, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : MAX_ITEMS)); }
function fitItems(items, limit) { const output = []; let bytes = 2; for (const item of items.slice(0, limit)) { const size = Buffer.byteLength(JSON.stringify(item)) + 1; if (bytes + size > 60 * 1024) break; output.push(item); bytes += size; } return output; }
function boundaryMs(value, fallback) { const result = Date.parse(String(value || "")); return Number.isNaN(result) ? fallback : result; }
class ConnectorError extends Error { constructor(code, message) { super(message); this.code = code; } }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) { if (!line.trim()) continue; let request; try { request = JSON.parse(line); } catch { emit({ version: 1, type: "error", id: "unknown", code: "invalid_request", message: "Invalid JSON." }); continue; } try { if (!await handle(request)) break; } catch (error) { emit({ version: 1, type: "error", id: request.id, code: error?.code || "connector_failed", message: error?.message || "RSS connector failed." }); } }
}
