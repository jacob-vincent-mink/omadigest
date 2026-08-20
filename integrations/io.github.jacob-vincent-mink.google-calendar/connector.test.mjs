import test from "node:test";
import assert from "node:assert/strict";
import { parseIcs } from "./connector.mjs";

test("parses bounded calendar events", () => {
  const events = parseIcs([
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:abc123",
    "DTSTART:20260820T090000Z",
    "DTEND:20260820T100000Z",
    "SUMMARY:Design\\, review",
    "URL:https://calendar.google.com/event?secret=removed",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n"));
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, "abc123");
  assert.equal(events[0].summary, "Design, review");
  assert.equal(events[0].start.toISOString(), "2026-08-20T09:00:00.000Z");
  assert.equal(events[0].url, "https://calendar.google.com/event");
});

test("ignores malformed events", () => {
  assert.deepEqual(parseIcs("BEGIN:VEVENT\nSUMMARY:No time\nEND:VEVENT"), []);
});
