#!/usr/bin/env node
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONNECTOR_ID = "io.github.jacob-vincent-mink.x";
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_ITEMS = 50;
const DECLARED_CATEGORIES = new Set(["mentions", "account-activity"]);

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

export async function handle(request, fetchImpl = fetch) {
  validateRequest(request);
  if (request.type === "shutdown") return false;
  if (request.type === "open") {
    emit({ version: 1, type: "open_request", id: request.id, url: "https://x.com/notifications/mentions" });
    return true;
  }
  const config = parseConfig(request.config);
  if (request.type === "probe" || request.type === "setup") {
    const result = await apiJson(`/2/users/by/username/${encodeURIComponent(config.username)}`, config.token, fetchImpl);
    const username = cleanUsername(result?.data?.username);
    if (!username) throw new ConnectorError("source_invalid", "X returned an invalid account response.");
    emit({ version: 1, type: "status", id: request.id, state: "ready", message: `X API connected for @${username}` });
    return true;
  }
  if (request.type !== "sync") throw new ConnectorError("unsupported_operation", "This connector supports probe, setup, sync, and open.");
  const enabled = requestedCategories(request);
  const items = await syncX(request, config, enabled, fetchImpl);
  emit({ version: 1, type: "items", id: request.id, items, nextCursor: null });
  return true;
}

export async function syncX(request, config, enabled, fetchImpl) {
  if (enabled.size === 0) return [];
  const limit = boundedLimit(request.limit);
  const queryParts = [];
  if (enabled.has("mentions")) queryParts.push(`@${config.username}`);
  if (enabled.has("account-activity") && config.accounts.length) queryParts.push(`(${config.accounts.map((name) => `from:${name}`).join(" OR ")})`);
  if (queryParts.length === 0) return [];
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", `(${queryParts.join(" OR ")}) -is:retweet`);
  url.searchParams.set("max_results", String(Math.max(10, limit)));
  url.searchParams.set("tweet.fields", "author_id,created_at");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username");
  const since = validBoundary(request.since);
  const until = validBoundary(request.until);
  if (since) url.searchParams.set("start_time", since);
  if (until) url.searchParams.set("end_time", until);
  const result = await apiJson(url, config.token, fetchImpl);
  return parsePosts(result, config.username, config.accounts, request.since, request.until, limit, enabled);
}

export function parsePosts(payload, username, selectedAccounts, sinceValue, untilValue, limit = MAX_ITEMS, enabled = DECLARED_CATEGORIES) {
  const authors = new Map((Array.isArray(payload?.includes?.users) ? payload.includes.users : []).flatMap((user) => {
    const id = bounded(user?.id, 80); const name = cleanUsername(user?.username);
    return id && name ? [[id, name]] : [];
  }));
  const selected = new Set(selectedAccounts.map((value) => value.toLowerCase()));
  const own = username.toLowerCase();
  const since = boundaryMs(sinceValue, -Infinity);
  const until = boundaryMs(untilValue, Infinity);
  const items = (Array.isArray(payload?.data) ? payload.data : []).flatMap((post) => {
    const id = bounded(post?.id, 100);
    const text = bounded(post?.text, 4_000);
    const occurredAt = timestamp(post?.created_at);
    const author = authors.get(bounded(post?.author_id, 80));
    if (!/^\d{1,30}$/u.test(id) || !text || !occurredAt || !author) return [];
    const time = Date.parse(occurredAt);
    if (time < since || time > until) return [];
    const lowerText = text.toLowerCase();
    const category = enabled.has("account-activity") && selected.has(author.toLowerCase()) && author.toLowerCase() !== own ? "account-activity"
      : enabled.has("mentions") && lowerText.includes(`@${own}`) ? "mentions" : undefined;
    if (!category) return [];
    return [{
      id: `x:post:${id}`, connector: CONNECTOR_ID, category, kind: "x-post", occurredAt,
      title: bounded(`@${author}: ${text}`, 2_000), body: category === "mentions" ? "Public mention on X" : "Selected public account activity",
      url: `https://x.com/${author}/status/${id}`, sensitivity: "public", derivedFrom: [`x:post:${id}`]
    }];
  }).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return fitItems(items, boundedLimit(limit));
}

async function apiJson(input, token, fetchImpl) {
  let response;
  try { response = await fetchImpl(input instanceof URL ? input : new URL(input, "https://api.x.com"), { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw new ConnectorError(error?.name === "TimeoutError" ? "source_timeout" : "source_unavailable", "X API could not be reached."); }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "authentication_required" : response.status === 429 ? "rate_limited" : "source_unavailable";
    throw new ConnectorError(code, code === "authentication_required" ? "X rejected the bearer token or API access level." : `X API returned ${response.status}.`);
  }
  return readJson(response);
}

async function readJson(response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "X returned too much data.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "X returned too much data.");
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ConnectorError("source_invalid", "X returned invalid JSON."); }
}
function parseConfig(config) {
  const token = typeof config?.bearer_token === "string" ? config.bearer_token.trim() : "";
  const username = cleanUsername(config?.username);
  if (!token) throw new ConnectorError("authentication_required", "Add an X API bearer token in settings.");
  if (token.length > 4_096) throw new ConnectorError("invalid_setup", "The X bearer token is too long.");
  if (!username) throw new ConnectorError("invalid_setup", "Enter a valid X username without the @ sign.");
  const accounts = String(config?.selected_accounts || "").split(",").map(cleanUsername).filter(Boolean).slice(0, 5);
  return { token, username, accounts: [...new Set(accounts)] };
}
function validateRequest(value) { if (value?.version !== 1 || typeof value.id !== "string" || value.id.length > 240) throw new ConnectorError("invalid_request", "Invalid connector request."); }
export function requestedCategories(request) { if (request.categories === undefined) return new Set(DECLARED_CATEGORIES); if (!Array.isArray(request.categories)) throw new ConnectorError("invalid_request", "Sync categories must be an array."); return new Set(request.categories.slice(0, 32).filter((value) => typeof value === "string" && DECLARED_CATEGORIES.has(value))); }
function cleanUsername(value) { const text = String(value || "").trim().replace(/^@/u, ""); return /^[A-Za-z0-9_]{1,15}$/u.test(text) ? text : ""; }
function bounded(value, length) { return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, length); }
function boundedLimit(value) { return Math.max(1, Math.min(MAX_ITEMS, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : MAX_ITEMS)); }
function fitItems(items, limit) { const output = []; let bytes = 2; for (const item of items.slice(0, limit)) { const size = Buffer.byteLength(JSON.stringify(item)) + 1; if (bytes + size > 60 * 1024) break; output.push(item); bytes += size; } return output; }
function timestamp(value) { const date = new Date(String(value || "")); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
function boundaryMs(value, fallback) { const result = Date.parse(String(value || "")); return Number.isNaN(result) ? fallback : result; }
function validBoundary(value) { const date = timestamp(value); return date; }
class ConnectorError extends Error { constructor(code, message) { super(message); this.code = code; } }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { emit({ version: 1, type: "error", id: "unknown", code: "invalid_request", message: "Invalid JSON." }); continue; }
    try { if (!await handle(request)) break; }
    catch (error) { emit({ version: 1, type: "error", id: request.id, code: error?.code || "connector_failed", message: error?.message || "X connector failed." }); }
  }
}
