#!/usr/bin/env node
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_ICS_BYTES = 5 * 1024 * 1024;

function emit(value) { process.stdout.write(`${JSON.stringify(value)}\n`); }

function calendarUrl(config) {
  const raw = typeof config?.calendar_url === "string" ? config.calendar_url.trim() : "";
  if (!raw) throw new ConnectorError("authentication_required", "Add the calendar's secret iCal address in settings.");
  let url;
  try { url = new URL(raw); } catch { throw new ConnectorError("invalid_setup", "The calendar address is invalid."); }
  if (url.protocol !== "https:" || url.hostname !== "calendar.google.com" || url.username || url.password)
    throw new ConnectorError("invalid_setup", "Use an HTTPS Secret iCal address from calendar.google.com.");
  return url;
}

async function handle(request) {
  if (request?.version !== 1 || typeof request.id !== "string") throw new ConnectorError("invalid_request", "Invalid connector request.");
  if (request.type === "shutdown") return false;
  if (request.type === "probe" || request.type === "setup") {
    calendarUrl(request.config);
    emit({ version: 1, type: "status", id: request.id, state: "ready", message: "Google Calendar connected" });
    return true;
  }
  if (request.type === "open") {
    emit({ version: 1, type: "open_request", id: request.id, url: "https://calendar.google.com/calendar/u/0/r" });
    return true;
  }
  if (request.type !== "sync") throw new ConnectorError("unsupported_operation", "This connector supports probe, setup, sync, and open.");

  const url = calendarUrl(request.config);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new ConnectorError(response.status === 401 || response.status === 403 ? "authentication_required" : "source_unavailable", `Google Calendar returned ${response.status}.`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_ICS_BYTES) throw new ConnectorError("source_too_large", "The calendar feed is too large.");
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_ICS_BYTES) throw new ConnectorError("source_too_large", "The calendar feed is too large.");

  const since = parseBoundary(request.since, new Date());
  const until = parseBoundary(request.until, new Date(since.getTime() + 7 * 86_400_000));
  const limit = Math.max(1, Math.min(100, Number(request.limit) || 50));
  const categories = requestedCategorySet(request.categories, ["timed-events", "all-day-events"]);
  const events = parseIcs(text)
    .filter((event) => event.start && event.start <= until && (event.end || event.start) >= since)
    .filter((event) => categories.has(event.allDay ? "all-day-events" : "timed-events"))
    .sort((a, b) => a.start - b.start)
    .slice(0, limit)
    .map((event) => ({
      id: `google-calendar:event:${event.uid}`,
      connector: "io.github.jacob-vincent-mink.google-calendar",
      category: event.allDay ? "all-day-events" : "timed-events",
      kind: "calendar-event",
      occurredAt: event.start.toISOString(),
      title: event.summary || "Untitled event",
      body: event.end ? `Ends ${event.end.toISOString()}` : "",
      ...(event.url ? { url: event.url } : {}),
      sensitivity: "personal",
      derivedFrom: [`google-calendar:event:${event.uid}`]
    }));
  emit({ version: 1, type: "items", id: request.id, items: events, nextCursor: null });
  return true;
}

export function parseIcs(raw) {
  const unfolded = raw.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.match(/BEGIN:VEVENT\r?\n[\s\S]*?\r?\nEND:VEVENT/g) || [];
  return blocks.flatMap((block, index) => {
    const fields = new Map();
    for (const line of block.split(/\r?\n/)) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const fieldName = line.slice(0, colon);
      const key = fieldName.split(";", 1)[0].toUpperCase();
      if (!fields.has(key)) fields.set(key, line.slice(colon + 1));
      if (key === "DTSTART" && /(?:^|;)VALUE=DATE(?:;|$)/iu.test(fieldName)) fields.set("DTSTART_ALL_DAY", "true");
    }
    const start = parseIcsDate(fields.get("DTSTART"));
    if (!start) return [];
    return [{
      uid: bounded(fields.get("UID") || `event-${index}`, 200),
      summary: decodeText(fields.get("SUMMARY") || ""),
      start,
      end: parseIcsDate(fields.get("DTEND")),
      allDay: fields.get("DTSTART_ALL_DAY") === "true" || /^\d{8}$/u.test(fields.get("DTSTART") || ""),
      url: safeEventUrl(fields.get("URL"))
    }];
  });
}

function parseIcsDate(value) {
  if (typeof value !== "string") return undefined;
  if (/^\d{8}$/u.test(value)) return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00`);
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/u.exec(value);
  if (!match) return undefined;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] || ""}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseBoundary(value, fallback) {
  const parsed = typeof value === "string" ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
function requestedCategorySet(value, defaults) {
  if (!Array.isArray(value)) return new Set(defaults);
  return new Set(value.filter((category) => defaults.includes(category)).slice(0, defaults.length));
}
function decodeText(value) { return bounded(value.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1"), 2_000); }
function bounded(value, length) { return String(value).replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").trim().slice(0, length); }
function safeEventUrl(raw) {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    url.search = ""; url.hash = "";
    return url.href.slice(0, 2_048);
  } catch { return undefined; }
}

class ConnectorError extends Error { constructor(code, message) { super(message); this.code = code; } }

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { emit({ version: 1, type: "error", id: "unknown", code: "invalid_request", message: "Invalid JSON." }); continue; }
    try { if (!await handle(request)) break; }
    catch (error) { emit({ version: 1, type: "error", id: request.id, code: error?.code || "connector_failed", message: error?.message || "Calendar connector failed." }); }
  }
}
