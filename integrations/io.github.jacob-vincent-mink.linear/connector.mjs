#!/usr/bin/env node
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONNECTOR_ID = "io.github.jacob-vincent-mink.linear";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_ITEMS = 50;
const DECLARED_CATEGORIES = new Set(["assigned-issues", "mentions-comments", "state-changes", "due-work"]);

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

export async function handle(request, fetchImpl = fetch) {
  validateRequest(request);
  if (request.type === "shutdown") return false;
  if (request.type === "open") {
    emit({ version: 1, type: "open_request", id: request.id, url: "https://linear.app/inbox" });
    return true;
  }
  const key = apiKey(request.config);
  if (request.type === "probe" || request.type === "setup") {
    const result = await graphql("query OmaDigestProbe { viewer { id name } }", {}, key, fetchImpl);
    const name = bounded(result?.viewer?.name, 100);
    if (!bounded(result?.viewer?.id, 100)) throw new ConnectorError("source_invalid", "Linear returned an invalid viewer response.");
    emit({ version: 1, type: "status", id: request.id, state: "ready", message: `Linear connected${name ? ` as ${name}` : ""}` });
    return true;
  }
  if (request.type !== "sync") throw new ConnectorError("unsupported_operation", "This connector supports probe, setup, sync, and open.");
  const enabled = requestedCategories(request);
  const items = await syncLinear(request, key, enabled, fetchImpl);
  emit({ version: 1, type: "items", id: request.id, items, nextCursor: null });
  return true;
}

export async function syncLinear(request, key, enabled, fetchImpl) {
  if (enabled.size === 0) return [];
  const limit = boundedLimit(request.limit);
  const data = await graphql(linearQuery(enabled), { first: Math.min(50, limit) }, key, fetchImpl);
  return parseLinearData(data, request.since, request.until, limit, new Date(), enabled);
}

export function linearQuery(enabled) {
  const due = enabled.has("due-work") ? " dueDate" : "";
  const comments = enabled.has("mentions-comments") ? " comments(first: 10) { nodes { id body createdAt updatedAt user { id name } } }" : "";
  const history = enabled.has("state-changes") ? " history(first: 10) { nodes { id createdAt fromState { name } toState { name } } }" : "";
  return `query OmaDigest($first: Int!) { viewer { id name assignedIssues(first: $first, orderBy: updatedAt, filter: { state: { type: { nin: [\"completed\", \"canceled\"] } } }) { nodes { id identifier title url updatedAt state { name type }${due}${comments}${history} } } } }`;
}

export function parseLinearData(data, sinceValue, untilValue, limit = MAX_ITEMS, nowValue = new Date(), enabled = DECLARED_CATEGORIES) {
  const viewer = data?.viewer;
  const viewerId = bounded(viewer?.id, 100);
  const viewerName = bounded(viewer?.name, 100).toLowerCase();
  const since = boundaryMs(sinceValue, -Infinity); const until = boundaryMs(untilValue, Infinity);
  const now = nowValue instanceof Date && !Number.isNaN(nowValue.getTime()) ? nowValue : new Date();
  const dueSoon = new Date(now); dueSoon.setUTCDate(dueSoon.getUTCDate() + 7);
  const issues = Array.isArray(viewer?.assignedIssues?.nodes) ? viewer.assignedIssues.nodes : [];
  const items = [];
  for (const issue of issues.slice(0, 50)) {
    const id = bounded(issue?.id, 120); const identifier = bounded(issue?.identifier, 40); const title = bounded(issue?.title, 1_500);
    const updatedAt = timestamp(issue?.updatedAt); const url = safeLinearUrl(issue?.url);
    if (!id || !identifier || !title || !updatedAt) continue;
    const state = bounded(issue?.state?.name, 120) || "Unknown state";
    if (enabled.has("assigned-issues") && inside(updatedAt, since, until)) items.push(item(`linear:issue:${id}`, "assigned-issues", updatedAt, `${identifier}: ${title}`, `Assigned to you · ${state}`, url));

    const due = dueTimestamp(issue?.dueDate);
    if (enabled.has("due-work") && due && due.getTime() <= dueSoon.getTime()) {
      const label = due.getTime() < startOfUtcDay(now).getTime() ? "Overdue" : due.toISOString().slice(0, 10) === now.toISOString().slice(0, 10) ? "Due today" : `Due ${due.toISOString().slice(0, 10)}`;
      items.push(item(`linear:due:${id}:${due.toISOString().slice(0, 10)}`, "due-work", updatedAt, `${identifier}: ${title}`, `${label} · ${state}`, url));
    }
    for (const comment of (enabled.has("mentions-comments") && Array.isArray(issue?.comments?.nodes) ? issue.comments.nodes : []).slice(0, 10)) {
      const commentId = bounded(comment?.id, 120); const occurredAt = timestamp(comment?.createdAt || comment?.updatedAt); const body = bounded(comment?.body, 4_000);
      if (!commentId || !occurredAt || !body || !inside(occurredAt, since, until) || bounded(comment?.user?.id, 100) === viewerId) continue;
      const author = bounded(comment?.user?.name, 100) || "Linear user";
      const mention = viewerName && body.toLowerCase().includes(`@${viewerName}`);
      items.push(item(`linear:comment:${commentId}`, "mentions-comments", occurredAt, `${mention ? "Mention" : "Comment"} on ${identifier}: ${title}`, `${author}: ${body}`, url));
    }
    for (const change of (enabled.has("state-changes") && Array.isArray(issue?.history?.nodes) ? issue.history.nodes : []).slice(0, 10)) {
      const changeId = bounded(change?.id, 120); const occurredAt = timestamp(change?.createdAt);
      const from = bounded(change?.fromState?.name, 120); const to = bounded(change?.toState?.name, 120);
      if (!changeId || !occurredAt || !from || !to || from === to || !inside(occurredAt, since, until)) continue;
      items.push(item(`linear:state:${changeId}`, "state-changes", occurredAt, `${identifier}: ${title}`, `State changed from ${from} to ${to}`, url));
    }
  }
  return fitItems(items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)), boundedLimit(limit));
}

function item(id, category, occurredAt, title, body, url) {
  return { id, connector: CONNECTOR_ID, category, kind: "linear-update", occurredAt, title: bounded(title, 2_000), body: bounded(body, 8_000), ...(url ? { url } : {}), sensitivity: "work", derivedFrom: [id] };
}
async function graphql(query, variables, key, fetchImpl) {
  let response;
  try { response = await fetchImpl("https://api.linear.app/graphql", { method: "POST", headers: { authorization: key, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ query, variables }), redirect: "error", signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw new ConnectorError(error?.name === "TimeoutError" ? "source_timeout" : "source_unavailable", "Linear could not be reached."); }
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? "authentication_required" : response.status === 429 ? "rate_limited" : "source_unavailable";
    throw new ConnectorError(code, code === "authentication_required" ? "Linear rejected the personal API key or its read permissions." : `Linear returned ${response.status}.`);
  }
  const parsed = await readJson(response);
  if (Array.isArray(parsed?.errors) && parsed.errors.length) throw new ConnectorError("source_rejected", "Linear rejected the GraphQL query or the key lacks required read access.");
  if (!parsed?.data) throw new ConnectorError("source_invalid", "Linear returned invalid GraphQL data.");
  return parsed.data;
}
async function readJson(response) {
  const length = Number(response.headers.get("content-length") || 0); if (length > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "Linear returned too much data.");
  const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "Linear returned too much data.");
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ConnectorError("source_invalid", "Linear returned invalid JSON."); }
}
function apiKey(config) { const value = typeof config?.api_key === "string" ? config.api_key.trim() : ""; if (!value) throw new ConnectorError("authentication_required", "Add a Linear personal API key in settings."); if (value.length > 4_096) throw new ConnectorError("invalid_setup", "The Linear API key is too long."); return value; }
function safeLinearUrl(raw) { try { const url = new URL(String(raw || "")); if (url.protocol !== "https:" || url.hostname !== "linear.app" || url.username || url.password) return undefined; url.search = ""; url.hash = ""; return url.href.slice(0, 2_048); } catch { return undefined; } }
function validateRequest(value) { if (value?.version !== 1 || typeof value.id !== "string" || value.id.length > 240) throw new ConnectorError("invalid_request", "Invalid connector request."); }
export function requestedCategories(request) { if (request.categories === undefined) return new Set(DECLARED_CATEGORIES); if (!Array.isArray(request.categories)) throw new ConnectorError("invalid_request", "Sync categories must be an array."); return new Set(request.categories.slice(0, 32).filter((value) => typeof value === "string" && DECLARED_CATEGORIES.has(value))); }
function bounded(value, length) { return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, length); }
function boundedLimit(value) { return Math.max(1, Math.min(MAX_ITEMS, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : MAX_ITEMS)); }
function fitItems(items, limit) { const output = []; let bytes = 2; for (const item of items.slice(0, limit)) { const size = Buffer.byteLength(JSON.stringify(item)) + 1; if (bytes + size > 60 * 1024) break; output.push(item); bytes += size; } return output; }
function timestamp(value) { const date = new Date(String(value || "")); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
function boundaryMs(value, fallback) { const result = Date.parse(String(value || "")); return Number.isNaN(result) ? fallback : result; }
function inside(value, since, until) { const time = Date.parse(value); return time >= since && time <= until; }
function dueTimestamp(value) { if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""))) return undefined; const date = new Date(`${value}T23:59:59.999Z`); return Number.isNaN(date.getTime()) ? undefined : date; }
function startOfUtcDay(date) { return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); }
class ConnectorError extends Error { constructor(code, message) { super(message); this.code = code; } }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue; let request;
    try { request = JSON.parse(line); } catch { emit({ version: 1, type: "error", id: "unknown", code: "invalid_request", message: "Invalid JSON." }); continue; }
    try { if (!await handle(request)) break; } catch (error) { emit({ version: 1, type: "error", id: request.id, code: error?.code || "connector_failed", message: error?.message || "Linear connector failed." }); }
  }
}
