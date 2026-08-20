#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CONNECTOR_ID = "io.github.jacob-vincent-mink.github";
const MAX_GH_BYTES = 512 * 1024;

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

async function handle(request) {
  if (request?.version !== 1 || typeof request.id !== "string")
    throw new ConnectorError("invalid_request", "Invalid connector request.");
  if (request.type === "shutdown") return false;
  if (request.type === "probe" || request.type === "setup") {
    const raw = await gh(["api", "user", "--jq", ".login"]);
    emit({ version: 1, type: "status", id: request.id, state: "ready", message: `GitHub connected as ${parseLogin(raw)}` });
    return true;
  }
  if (request.type === "open") {
    emit({ version: 1, type: "open_request", id: request.id, url: "https://github.com/notifications" });
    return true;
  }
  if (request.type !== "sync")
    throw new ConnectorError("unsupported_operation", "This connector supports probe, setup, sync, and open.");

  const limit = Math.max(1, Math.min(50, Number(request.limit) || 50));
  const raw = await gh(["api", `notifications?all=false&participating=false&per_page=${limit}`]);
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new ConnectorError("source_invalid", "GitHub returned invalid notification data."); }
  if (!Array.isArray(parsed)) throw new ConnectorError("source_invalid", "GitHub returned invalid notification data.");
  const items = parseNotifications(parsed, request.since, request.until, limit);
  emit({ version: 1, type: "items", id: request.id, items, nextCursor: null });
  return true;
}

export function parseNotifications(values, sinceValue, untilValue, limit = 50) {
  const since = boundary(sinceValue, new Date(0));
  const until = boundary(untilValue, new Date(8_640_000_000_000_000));
  return values.flatMap((notification) => {
    const id = bounded(notification?.id, 180);
    const updated = new Date(notification?.updated_at || "");
    const repository = bounded(notification?.repository?.full_name, 180);
    const subject = bounded(notification?.subject?.title, 1_500);
    if (!id || !repository || !subject || Number.isNaN(updated.getTime()) || updated < since || updated > until) return [];
    const type = subjectType(notification?.subject?.type);
    const reason = reasonLabel(notification?.reason);
    const url = apiUrlToWebUrl(notification?.subject?.url, notification?.repository?.html_url);
    return [{
      id: `github:notification:${id}`,
      connector: CONNECTOR_ID,
      kind: "github-notification",
      occurredAt: updated.toISOString(),
      title: bounded(`[${repository}] ${subject}`, 2_000),
      body: bounded(`${reason} · ${type}`, 500),
      ...(url ? { url } : {}),
      sensitivity: "work",
      derivedFrom: [`github:notification:${id}`]
    }];
  }).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, Math.max(1, Math.min(50, Number(limit) || 50)));
}

export function apiUrlToWebUrl(raw, repositoryUrl) {
  const api = bounded(raw, 2_048);
  const repository = safeGithubUrl(repositoryUrl);
  if (!api) return repository;
  const match = /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)$/u.exec(api);
  if (match) return `https://github.com/${match[1]}/${match[2]}/${match[3] === "pulls" ? "pull" : "issues"}/${match[4]}`;
  return repository;
}

function parseLogin(raw) {
  const value = String(raw || "").trim();
  try { return bounded(JSON.parse(value)?.login, 100) || "authenticated user"; }
  catch { return bounded(value, 100) || "authenticated user"; }
}
function safeGithubUrl(raw) {
  try {
    const url = new URL(String(raw || ""));
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password) return undefined;
    url.search = ""; url.hash = "";
    return url.href.slice(0, 2_048);
  } catch { return undefined; }
}
function boundary(value, fallback) {
  const parsed = typeof value === "string" ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
function reasonLabel(value) {
  const labels = {
    assign: "Assigned to you", author: "Activity on your thread", ci_activity: "CI activity",
    comment: "New comment", invitation: "Repository invitation", manual: "Subscribed update",
    mention: "You were mentioned", review_requested: "Review requested", security_alert: "Security alert",
    state_change: "State changed", subscribed: "Watching this thread", team_mention: "Your team was mentioned"
  };
  return labels[String(value || "")] || "GitHub update";
}
function subjectType(value) {
  const labels = { PullRequest: "Pull request", Issue: "Issue", Release: "Release", Discussion: "Discussion", CheckSuite: "Check run" };
  return labels[String(value || "")] || bounded(value, 80) || "Notification";
}
function bounded(value, length) { return String(value || "").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").trim().slice(0, length); }

function gh(args) {
  return new Promise((resolveCall, rejectCall) => {
    execFile("gh", args, { encoding: "utf8", timeout: 15_000, maxBuffer: MAX_GH_BYTES }, (error, stdout) => {
      if (error !== null) rejectCall(new ConnectorError("authentication_required", "GitHub CLI authentication is unavailable."));
      else resolveCall(stdout);
    });
  });
}

class ConnectorError extends Error { constructor(code, message) { super(message); this.code = code; } }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); }
    catch { emit({ version: 1, type: "error", id: "unknown", code: "invalid_request", message: "Invalid JSON." }); continue; }
    try { if (!await handle(request)) break; }
    catch (error) { emit({ version: 1, type: "error", id: request.id, code: error?.code || "connector_failed", message: error?.message || "GitHub connector failed." }); }
  }
}
