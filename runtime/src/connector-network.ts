import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { z } from "zod";
import type { DiscoveredIntegration } from "./integrations.js";

const MAX_NETWORK_BODY_BYTES = 64 * 1024;
const MAX_NETWORK_RESPONSE_BYTES = 512 * 1024;
const MAX_NETWORK_HEADERS = 16;
const NETWORK_TIMEOUT_MS = 15_000;
const allowedRequestHeaders = new Set(["accept", "authorization", "content-type", "if-modified-since", "if-none-match", "user-agent"]);
const returnedResponseHeaders = new Set(["content-type", "etag", "last-modified", "link", "location", "retry-after"]);

const boundedBody = z.string().max(MAX_NETWORK_BODY_BYTES).refine(
  (value) => Buffer.byteLength(value, "utf8") <= MAX_NETWORK_BODY_BYTES,
  "Network request body is too large"
);

const networkRequestSchema = z.object({
  version: z.literal(1),
  type: z.literal("network_request"),
  id: z.string().min(1).max(100),
  requestId: z.string().min(1).max(100),
  method: z.enum(["GET", "POST"]),
  url: z.string().url().max(2_048),
  headers: z.record(z.string().min(1).max(80), z.string().max(8_000)).default({}),
  body: boundedBody.optional()
}).strict().superRefine((value, context) => {
  if (Object.keys(value.headers).length > MAX_NETWORK_HEADERS)
    context.addIssue({ code: "custom", path: ["headers"], message: "Too many network request headers" });
  for (const [name, headerValue] of Object.entries(value.headers)) {
    if (!allowedRequestHeaders.has(name.toLowerCase()))
      context.addIssue({ code: "custom", path: ["headers", name], message: "Unsupported network request header" });
    if (Buffer.byteLength(headerValue, "utf8") > 8_000)
      context.addIssue({ code: "custom", path: ["headers", name], message: "Network request header is too large" });
  }
});

export async function proxyConnectorHttps(
  integration: DiscoveredIntegration,
  parentRequest: Record<string, unknown>,
  rawRequest: unknown
): Promise<Record<string, unknown>> {
  const networkRequest = networkRequestSchema.parse(rawRequest);
  if (networkRequest.id !== parentRequest.id) throw new Error("Network request did not match its connector call");

  const url = new URL(networkRequest.url);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "")
    throw new Error("Connector network requests require credential-free HTTPS URLs without fragments");
  const allowed = allowedAuthorities(integration, parentRequest);
  if (!allowed.has(canonicalAuthority(url))) throw new Error("Connector requested an undeclared network host");

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address)))
    throw new Error("Connector network host resolved to a private or non-routable address");
  const selected = addresses[0]!;
  const headers = normalizeRequestHeaders(networkRequest.headers);
  const body = networkRequest.body === undefined ? undefined : Buffer.from(networkRequest.body, "utf8");
  if (body !== undefined) headers["content-length"] = String(body.byteLength);

  return new Promise((resolveRequest, rejectRequest) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      rejectRequest(error);
    };
    const request = httpsRequest(url, {
      method: networkRequest.method,
      headers,
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family)
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > MAX_NETWORK_RESPONSE_BYTES) {
          request.destroy(new Error("Connector network response exceeded the byte limit"));
          return;
        }
        chunks.push(buffer);
      });
      response.once("error", fail);
      response.once("end", () => {
        if (settled) return;
        settled = true;
        resolveRequest({
          version: 1,
          type: "network_response",
          id: networkRequest.id,
          requestId: networkRequest.requestId,
          status: response.statusCode ?? 0,
          headers: selectResponseHeaders(response.headers),
          body: Buffer.concat(chunks, bytes).toString("utf8")
        });
      });
    });
    request.setTimeout(NETWORK_TIMEOUT_MS, () => request.destroy(new Error("Connector network request timed out")));
    request.once("error", fail);
    if (body !== undefined) request.write(body);
    request.end();
  });
}

function allowedAuthorities(integration: DiscoveredIntegration, parentRequest: Record<string, unknown>): Set<string> {
  const values = new Set<string>();
  for (const declaration of integration.manifest.permissions.networkHosts) {
    const parsed = declaredAuthority(declaration);
    if (parsed !== undefined) values.add(parsed);
  }
  const config = isObject(parentRequest.config) ? parentRequest.config : {};
  for (const key of integration.manifest.permissions.networkSetupFields ?? []) {
    const raw = config[key];
    if (typeof raw !== "string") continue;
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" && url.username === "" && url.password === "") values.add(canonicalAuthority(url));
    } catch { /* Invalid setup never adds authority. */ }
  }
  return values;
}

function declaredAuthority(value: string): string | undefined {
  try {
    const url = new URL(`https://${value}`);
    if (url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.username !== "" || url.password !== "") return undefined;
    return canonicalAuthority(url);
  } catch { return undefined; }
}

function canonicalAuthority(url: URL): string {
  const port = url.port === "" || url.port === "443" ? "" : `:${url.port}`;
  return `${url.hostname.toLowerCase()}${port}`;
}

function normalizeRequestHeaders(raw: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) headers[name.toLowerCase()] = value;
  if (headers["user-agent"] === undefined) headers["user-agent"] = "OmaDigest-Connector/1";
  return headers;
}

function selectResponseHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const selected: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!returnedResponseHeaders.has(name.toLowerCase()) || value === undefined) continue;
    selected[name.toLowerCase()] = (Array.isArray(value) ? value.join(", ") : value).slice(0, 8_000);
  }
  return selected;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split(".").map(Number);
    const [first, second] = octets;
    if (first === undefined || second === undefined) return false;
    if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
    if (first === 100 && second >= 64 && second <= 127) return false;
    if (first === 169 && second === 254) return false;
    if (first === 172 && second >= 16 && second <= 31) return false;
    if (first === 192 && (second === 0 || second === 168)) return false;
    if (first === 198 && (second === 18 || second === 19 || second === 51)) return false;
    if (first === 203 && second === 0) return false;
    return true;
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || /^fe[89ab]/u.test(normalized)) return false;
  if (normalized.startsWith("ff") || normalized.startsWith("2001:db8:")) return false;
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)?.[1];
  return mapped === undefined || isPublicAddress(mapped);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
