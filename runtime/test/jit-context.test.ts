import { describe, expect, it } from "vitest";
import { detectJitContext, isJitActionWindow } from "../src/jit-context.js";
import type { AttentionItem } from "../src/types.js";

function item(title: string, body: string, occurredAt = "2026-08-23T12:00:00.000Z"): AttentionItem {
  return { id: title, source: "notifications", app: "Calendar", title, body, urgency: "normal", occurredAt };
}

describe("just-in-time context detection", () => {
  it("detects bounded relative meeting and deadline windows", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    expect(detectJitContext([item("Design review", "Meeting starts in 25 minutes")], now)).toMatchObject({
      minutesUntil: 25
    });
    expect(detectJitContext([item("Report due", "Deadline in 2 hours")], now)).toMatchObject({
      minutesUntil: 120
    });
  });

  it("ignores vague or out-of-window updates", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    expect(detectJitContext([item("Team update", "No meeting time supplied")], now)).toBeUndefined();
    expect(detectJitContext([item("Planning meeting", "Meeting starts in 48 hours")], now)).toBeUndefined();
  });

  it("requires action once an approaching event enters the fifteen-minute window", () => {
    expect(isJitActionWindow({ sourceId: "meeting", subject: "Review", dueAt: "2026-08-23T15:12:00.000Z", minutesUntil: 12 })).toBe(true);
    expect(isJitActionWindow({ sourceId: "meeting", subject: "Review", dueAt: "2026-08-23T15:25:00.000Z", minutesUntil: 25 })).toBe(false);
    expect(isJitActionWindow(undefined)).toBe(false);
  });
});
