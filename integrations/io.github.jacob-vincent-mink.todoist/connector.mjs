#!/usr/bin/env node
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONNECTOR_ID = "io.github.jacob-vincent-mink.todoist";
const MAX_RESPONSE_BYTES = 768 * 1024;
const MAX_ITEMS = 50;
const DECLARED_CATEGORIES = new Set(["overdue", "today-upcoming", "assigned", "completed-activity"]);

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

export async function handle(request, fetchImpl = fetch) {
  validateRequest(request);
  if (request.type === "shutdown") return false;
  if (request.type === "open") { emit({ version: 1, type: "open_request", id: request.id, url: "https://app.todoist.com/app/today" }); return true; }
  const token = apiToken(request.config);
  if (request.type === "probe" || request.type === "setup") {
    await todoistJson("/api/v1/tasks", { limit: "1" }, token, fetchImpl);
    emit({ version: 1, type: "status", id: request.id, state: "ready", message: "Todoist API connected" });
    return true;
  }
  if (request.type !== "sync") throw new ConnectorError("unsupported_operation", "This connector supports probe, setup, sync, and open.");
  const enabled = requestedCategories(request);
  const items = await syncTodoist(request, token, enabled, fetchImpl);
  emit({ version: 1, type: "items", id: request.id, items, nextCursor: null });
  return true;
}

export async function syncTodoist(request, token, enabled, fetchImpl) {
  if (enabled.size === 0) return [];
  const limit = boundedLimit(request.limit);
  const jobs = [];
  const dueQuery = enabled.has("overdue") && enabled.has("today-upcoming") ? "overdue | today | next 7 days" : enabled.has("overdue") ? "overdue" : enabled.has("today-upcoming") ? "today | next 7 days" : undefined;
  if (dueQuery) jobs.push(todoistJson("/api/v1/tasks/filter", { query: dueQuery, limit: String(Math.min(200, limit * 2)) }, token, fetchImpl).then((value) => ["due", value]));
  if (enabled.has("assigned")) jobs.push(todoistJson("/api/v1/tasks/filter", { query: "assigned to: me", limit: String(Math.min(200, limit * 2)) }, token, fetchImpl).then((value) => ["assigned", value]));
  if (enabled.has("completed-activity")) { const range = completionRange(request.since, request.until); jobs.push(todoistJson("/api/v1/tasks/completed/by_completion_date", { since: range.since, until: range.until, limit: String(limit) }, token, fetchImpl).then((value) => ["completed", value])); }
  const data = Object.fromEntries(await Promise.all(jobs));
  return parseTodoistData(data, request.since, request.until, limit, new Date(), enabled);
}

export function parseTodoistData({ due, assigned, completed }, sinceValue, untilValue, limit = MAX_ITEMS, nowValue = new Date(), enabled = DECLARED_CATEGORIES) {
  const now = nowValue instanceof Date && !Number.isNaN(nowValue.getTime()) ? nowValue : new Date();
  const today = now.toISOString().slice(0, 10); const future = new Date(`${today}T00:00:00Z`); future.setUTCDate(future.getUTCDate() + 7);
  const since = boundaryMs(sinceValue, -Infinity); const until = boundaryMs(untilValue, Infinity); const items = []; const seen = new Set();
  const add = (task, category, occurredAt, body) => {
    const id = bounded(task?.id, 120); const content = bounded(task?.content, 2_000); const time = timestamp(occurredAt);
    if (!id || !content || !time) return; const stableId = `todoist:${category}:${id}`; if (seen.has(stableId)) return; seen.add(stableId);
    items.push({ id: stableId, connector: CONNECTOR_ID, category, kind: "todoist-task", occurredAt: time, title: content, body: bounded(body, 1_000), url: `https://app.todoist.com/app/task/${encodeURIComponent(id)}`, sensitivity: "personal", derivedFrom: [`todoist:task:${id}`] });
  };
  for (const task of pageItems(due, "results").slice(0, 100)) {
    const date = dueDate(task?.due?.date); if (!date) continue;
    const label = date < today ? "overdue" : "today-upcoming";
    if (label === "today-upcoming" && new Date(`${date}T00:00:00Z`) > future) continue;
    if (enabled.has(label)) add(task, label, task?.updated_at || `${date}T00:00:00Z`, label === "overdue" ? `Overdue since ${date}` : date === today ? "Due today" : `Due ${date}`);
  }
  for (const task of (enabled.has("assigned") ? pageItems(assigned, "results") : []).slice(0, 100)) add(task, "assigned", task?.updated_at || task?.added_at, task?.due?.date ? `Assigned to you · due ${bounded(task.due.date, 40)}` : "Assigned to you");
  for (const task of (enabled.has("completed-activity") ? pageItems(completed, "items") : []).slice(0, 50)) {
    const occurredAt = timestamp(task?.completed_at); if (occurredAt && inside(occurredAt, since, until)) add(task, "completed-activity", occurredAt, "Completed task");
  }
  return fitItems(items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)), boundedLimit(limit));
}

async function todoistJson(path, parameters, token, fetchImpl) {
  const url = new URL(path, "https://api.todoist.com"); for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  let response;
  try { response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(8_000) }); }
  catch (error) { throw new ConnectorError(error?.name === "TimeoutError" ? "source_timeout" : "source_unavailable", "Todoist could not be reached."); }
  if (!response.ok) { const code = response.status === 401 || response.status === 403 ? "authentication_required" : response.status === 429 ? "rate_limited" : "source_unavailable"; throw new ConnectorError(code, code === "authentication_required" ? "Todoist rejected the API token." : `Todoist returned ${response.status}.`); }
  return readJson(response);
}
async function readJson(response) { const length = Number(response.headers.get("content-length") || 0); if (length > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "Todoist returned too much data."); const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "Todoist returned too much data."); try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ConnectorError("source_invalid", "Todoist returned invalid JSON."); } }
function completionRange(sinceValue, untilValue) { const now = Date.now(); let since = Date.parse(String(sinceValue || "")); let until = Date.parse(String(untilValue || "")); if (Number.isNaN(until)) until = now; if (Number.isNaN(since)) since = until - 7 * 86_400_000; since = Math.max(since, until - 89 * 86_400_000); if (since >= until) since = until - 86_400_000; return { since: new Date(since).toISOString(), until: new Date(until).toISOString() }; }
function pageItems(value, key) { return Array.isArray(value?.[key]) ? value[key] : []; }
function apiToken(config) { const value = typeof config?.api_token === "string" ? config.api_token.trim() : ""; if (!value) throw new ConnectorError("authentication_required", "Add a Todoist API token in settings."); if (value.length > 4_096) throw new ConnectorError("invalid_setup", "The Todoist token is too long."); return value; }
function dueDate(value) { const raw = String(value || ""); const match = /^\d{4}-\d{2}-\d{2}/u.exec(raw); return match && !Number.isNaN(Date.parse(`${match[0]}T00:00:00Z`)) ? match[0] : undefined; }
function validateRequest(value) { if (value?.version !== 1 || typeof value.id !== "string" || value.id.length > 240) throw new ConnectorError("invalid_request", "Invalid connector request."); }
export function requestedCategories(request) { if (request.categories === undefined) return new Set(DECLARED_CATEGORIES); if (!Array.isArray(request.categories)) throw new ConnectorError("invalid_request", "Sync categories must be an array."); return new Set(request.categories.slice(0, 32).filter((value) => typeof value === "string" && DECLARED_CATEGORIES.has(value))); }
function bounded(value, length) { return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, length); }
function boundedLimit(value) { return Math.max(1, Math.min(MAX_ITEMS, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : MAX_ITEMS)); }
function fitItems(items, limit) { const output = []; let bytes = 2; for (const item of items.slice(0, limit)) { const size = Buffer.byteLength(JSON.stringify(item)) + 1; if (bytes + size > 60 * 1024) break; output.push(item); bytes += size; } return output; }
function timestamp(value) { const date = new Date(String(value || "")); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
function boundaryMs(value, fallback) { const result = Date.parse(String(value || "")); return Number.isNaN(result) ? fallback : result; }
function inside(value, since, until) { const time = Date.parse(value); return time >= since && time <= until; }
class ConnectorError extends Error { constructor(code, message) { super(message); this.code = code; } }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) { if (!line.trim()) continue; let request; try { request = JSON.parse(line); } catch { emit({ version: 1, type: "error", id: "unknown", code: "invalid_request", message: "Invalid JSON." }); continue; } try { if (!await handle(request)) break; } catch (error) { emit({ version: 1, type: "error", id: request.id, code: error?.code || "connector_failed", message: error?.message || "Todoist connector failed." }); } }
}
