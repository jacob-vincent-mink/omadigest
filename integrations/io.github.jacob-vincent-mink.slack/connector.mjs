#!/usr/bin/env node
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONNECTOR_ID = "io.github.jacob-vincent-mink.slack";
const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_ITEMS = 50;
const DECLARED_CATEGORIES = new Set(["direct-messages", "mentions", "thread-replies"]);

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

export async function handle(request, fetchImpl = fetch) {
  validateRequest(request);
  if (request.type === "shutdown") return false;
  if (request.type === "open") { emit({ version: 1, type: "open_request", id: request.id, url: "https://app.slack.com/client" }); return true; }
  const config = parseConfig(request.config);
  if (request.type === "probe" || request.type === "setup") {
    const auth = await slackApi("auth.test", {}, config.token, fetchImpl);
    const user = bounded(auth.user, 100) || "authenticated identity"; const team = bounded(auth.team, 100);
    emit({ version: 1, type: "status", id: request.id, state: "ready", message: `Slack connected as ${user}${team ? ` in ${team}` : ""}` });
    return true;
  }
  if (request.type !== "sync") throw new ConnectorError("unsupported_operation", "This connector supports probe, setup, sync, and open.");
  const enabled = requestedCategories(request);
  const items = await syncSlack(request, config, enabled, fetchImpl);
  emit({ version: 1, type: "items", id: request.id, items, nextCursor: null });
  return true;
}

export async function syncSlack(request, config, enabled, fetchImpl) {
  if (enabled.size === 0) return [];
  const auth = await slackApi("auth.test", {}, config.token, fetchImpl);
  const userId = bounded(auth.user_id, 40); if (!userId) throw new ConnectorError("source_invalid", "Slack did not return an authenticated user ID.");
  const types = enabled.size === 1 && enabled.has("direct-messages") ? "mpim,im" : "public_channel,private_channel,mpim,im";
  const listed = await slackApi("conversations.list", { types, exclude_archived: "true", limit: "100" }, config.token, fetchImpl);
  const channels = (Array.isArray(listed.channels) ? listed.channels : []).filter((channel) => channel?.is_member || channel?.is_im || channel?.is_mpim).slice(0, config.maxConversations);
  const oldest = slackBoundary(request.since); const latest = slackBoundary(request.until);
  const histories = await Promise.all(channels.map(async (channel) => ({ channel, data: await slackApi("conversations.history", { channel: bounded(channel.id, 40), limit: "25", ...(oldest ? { oldest } : {}), ...(latest ? { latest } : {}) }, config.token, fetchImpl) })));
  const needReplies = enabled.has("thread-replies") || enabled.has("mentions");
  const parents = needReplies ? histories.flatMap(({ channel, data }) => (Array.isArray(data.messages) ? data.messages : []).filter((message) => Number(message?.reply_count) > 0 && message?.ts).map((message) => ({ channel, message }))).slice(0, 4) : [];
  const replySets = await Promise.all(parents.map(async ({ channel, message }) => ({ channel, parentTs: message.ts, data: await slackApi("conversations.replies", { channel: bounded(channel.id, 40), ts: bounded(message.ts, 40), limit: "25", ...(oldest ? { oldest } : {}), ...(latest ? { latest } : {}) }, config.token, fetchImpl) })));
  return parseSlackData({ userId, histories, replySets }, request.since, request.until, request.limit, enabled);
}

export function parseSlackData({ userId, histories, replySets }, sinceValue, untilValue, limit = MAX_ITEMS, enabled = DECLARED_CATEGORIES) {
  const since = boundaryMs(sinceValue, -Infinity); const until = boundaryMs(untilValue, Infinity); const items = [];
  const seen = new Set();
  const add = (category, channel, message) => {
    const channelId = bounded(channel?.id, 40); const ts = bounded(message?.ts, 40); const text = bounded(message?.text, 4_000); const sender = bounded(message?.user || message?.bot_id, 80);
    const occurredAt = slackTimestamp(ts); if (!channelId || !ts || !text || !occurredAt || !sender || sender === userId || !inside(occurredAt, since, until)) return;
    const id = `slack:${category}:${channelId}:${ts}`; if (seen.has(id)) return; seen.add(id);
    const location = channel?.is_im ? "Direct message" : channel?.is_mpim ? "Group direct message" : `#${bounded(channel?.name, 100) || channelId}`;
    items.push({ id, connector: CONNECTOR_ID, category, kind: "slack-message", occurredAt, title: bounded(`${location}: ${text}`, 2_000), body: bounded(`From ${sender}`, 500), sensitivity: "work", derivedFrom: [`slack:message:${channelId}:${ts}`] });
  };
  for (const { channel, data } of Array.isArray(histories) ? histories.slice(0, 8) : []) {
    for (const message of (Array.isArray(data?.messages) ? data.messages : []).slice(0, 25)) {
      if (enabled.has("direct-messages") && (channel?.is_im || channel?.is_mpim)) add("direct-messages", channel, message);
      if (enabled.has("mentions") && String(message?.text || "").includes(`<@${userId}>`)) add("mentions", channel, message);
    }
  }
  for (const { channel, parentTs, data } of Array.isArray(replySets) ? replySets.slice(0, 4) : []) {
    for (const message of (Array.isArray(data?.messages) ? data.messages : []).slice(0, 25)) {
      if (enabled.has("thread-replies") && message?.ts !== parentTs) add("thread-replies", channel, message);
      if (enabled.has("mentions") && String(message?.text || "").includes(`<@${userId}>`)) add("mentions", channel, message);
    }
  }
  return fitItems(items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)), boundedLimit(limit));
}

async function slackApi(method, parameters, token, fetchImpl) {
  const url = new URL(`https://slack.com/api/${method}`); for (const [key, value] of Object.entries(parameters)) if (value) url.searchParams.set(key, value);
  let response;
  try { response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(6_000) }); }
  catch (error) { throw new ConnectorError(error?.name === "TimeoutError" ? "source_timeout" : "source_unavailable", "Slack could not be reached."); }
  if (!response.ok) throw new ConnectorError(response.status === 429 ? "rate_limited" : "source_unavailable", `Slack returned HTTP ${response.status}.`);
  const parsed = await readJson(response);
  if (!parsed?.ok) {
    const error = String(parsed?.error || "");
    if (["invalid_auth", "not_authed", "token_expired", "token_revoked", "account_inactive"].includes(error)) throw new ConnectorError("authentication_required", "Slack rejected or expired the token.");
    if (["missing_scope", "no_permission", "not_allowed_token_type"].includes(error)) throw new ConnectorError("permission_required", "The Slack token lacks a required conversation read/history scope or membership.");
    if (error === "ratelimited") throw new ConnectorError("rate_limited", "Slack rate-limited the connector; try again later.");
    throw new ConnectorError("source_rejected", `Slack rejected ${method}.`);
  }
  return parsed;
}
async function readJson(response) { const length = Number(response.headers.get("content-length") || 0); if (length > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "Slack returned too much data."); const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new ConnectorError("source_too_large", "Slack returned too much data."); try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ConnectorError("source_invalid", "Slack returned invalid JSON."); } }
function parseConfig(config) { const token = typeof config?.token === "string" ? config.token.trim() : ""; if (!token) throw new ConnectorError("authentication_required", "Add a Slack bot or user token in settings."); if (token.length > 4_096) throw new ConnectorError("invalid_setup", "The Slack token is too long."); const raw = Number(config?.max_conversations || 8); const maxConversations = Number.isInteger(raw) && raw >= 1 && raw <= 8 ? raw : 8; return { token, maxConversations }; }
function slackTimestamp(value) { if (!/^\d{10,13}(?:\.\d{1,6})?$/u.test(String(value || ""))) return undefined; const milliseconds = Number(value) * 1000; return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined; }
function slackBoundary(value) { const parsed = Date.parse(String(value || "")); return Number.isNaN(parsed) ? undefined : String(parsed / 1000); }
function validateRequest(value) { if (value?.version !== 1 || typeof value.id !== "string" || value.id.length > 240) throw new ConnectorError("invalid_request", "Invalid connector request."); }
export function requestedCategories(request) { if (request.categories === undefined) return new Set(DECLARED_CATEGORIES); if (!Array.isArray(request.categories)) throw new ConnectorError("invalid_request", "Sync categories must be an array."); return new Set(request.categories.slice(0, 32).filter((value) => typeof value === "string" && DECLARED_CATEGORIES.has(value))); }
function bounded(value, length) { return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replace(/\s+/gu, " ").trim().slice(0, length); }
function boundedLimit(value) { return Math.max(1, Math.min(MAX_ITEMS, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : MAX_ITEMS)); }
function fitItems(items, limit) { const output = []; let bytes = 2; for (const item of items.slice(0, limit)) { const size = Buffer.byteLength(JSON.stringify(item)) + 1; if (bytes + size > 60 * 1024) break; output.push(item); bytes += size; } return output; }
function boundaryMs(value, fallback) { const result = Date.parse(String(value || "")); return Number.isNaN(result) ? fallback : result; }
function inside(value, since, until) { const time = Date.parse(value); return time >= since && time <= until; }
class ConnectorError extends Error { constructor(code, message) { super(message); this.code = code; } }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) { if (!line.trim()) continue; let request; try { request = JSON.parse(line); } catch { emit({ version: 1, type: "error", id: "unknown", code: "invalid_request", message: "Invalid JSON." }); continue; } try { if (!await handle(request)) break; } catch (error) { emit({ version: 1, type: "error", id: request.id, code: error?.code || "connector_failed", message: error?.message || "Slack connector failed." }); } }
}
