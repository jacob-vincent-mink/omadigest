import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATTENTION_DAILY_LIMIT,
  AttentionLedger,
  validateAttentionProposal
} from "../src/attention-loop.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function ledger(): AttentionLedger {
  const root = mkdtempSync(join(tmpdir(), "omadigest-loop-"));
  roots.push(root);
  return new AttentionLedger({ XDG_STATE_HOME: root, HOME: root });
}

describe("attention proposal validation", () => {
  const context = {
    availableSourceIds: new Set(["one", "two"]),
    availableTemplateIds: new Set(["general"]),
    allowHold: true,
    allowDigest: true,
    allowNotify: true,
    manual: false
  };

  it("accepts only cited evidence and installed templates", () => {
    expect(validateAttentionProposal({
      action: "digest", reason: "Useful briefing", sourceIds: ["one"], templateId: "general"
    }, context).action).toBe("digest");
    expect(() => validateAttentionProposal({
      action: "notify", reason: "Urgent", sourceIds: ["missing"], headline: "Review", body: "Now", urgency: "normal"
    }, context)).toThrow("unavailable evidence");
    expect(() => validateAttentionProposal({
      action: "digest", reason: "Brief", sourceIds: ["one"], templateId: "missing"
    }, context)).toThrow("unavailable template");
  });

  it("forces explicit user requests to produce a digest", () => {
    expect(() => validateAttentionProposal({
      action: "hold", reason: "Later", sourceIds: ["one"], followUpMinutes: 10
    }, { ...context, manual: true })).toThrow("manual request");
  });

  it("enforces broker-owned digest and interruption thresholds", () => {
    expect(() => validateAttentionProposal({
      action: "digest", reason: "Minor", sourceIds: ["one"], templateId: "general"
    }, { ...context, allowDigest: false })).toThrow("stronger digest signal");
    expect(() => validateAttentionProposal({
      action: "notify", reason: "Minor", sourceIds: ["one"], headline: "Update", body: "Available", urgency: "normal"
    }, { ...context, allowNotify: false })).toThrow("interruption threshold");
  });
});

describe("AttentionLedger", () => {
  it("persists bounded watches and makes them due at the broker-owned time", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-loop-persist-"));
    roots.push(root);
    const env = { XDG_STATE_HOME: root, HOME: root };
    const first = new AttentionLedger(env);
    const now = new Date("2026-08-22T12:00:00.000Z");
    const watch = first.schedule({
      action: "hold", reason: "Wait for CI", sourceIds: ["pr-42"], followUpMinutes: 15
    }, now);
    expect(first.due(new Date("2026-08-22T12:14:59.000Z"))).toEqual([]);
    expect(new AttentionLedger(env).due(new Date("2026-08-22T12:15:00.000Z"))[0]?.id).toBe(watch.id);
  });

  it("caps a watch at three follow-up attempts", () => {
    const state = ledger();
    let now = new Date("2026-08-22T12:00:00.000Z");
    let watch = state.schedule({ action: "hold", reason: "One", sourceIds: ["x"], followUpMinutes: 1 }, now);
    now = new Date("2026-08-22T12:01:00.000Z");
    watch = state.schedule({ action: "hold", reason: "Two", sourceIds: ["x"], followUpMinutes: 1 }, now, watch);
    now = new Date("2026-08-22T12:02:00.000Z");
    watch = state.schedule({ action: "hold", reason: "Three", sourceIds: ["x"], followUpMinutes: 1 }, now, watch);
    expect(() => state.schedule({ action: "hold", reason: "Four", sourceIds: ["x"], followUpMinutes: 1 },
      new Date("2026-08-22T12:03:00.000Z"), watch)).toThrow("follow-up limit");
  });

  it("rate-limits autonomous reviews while leaving explicit requests available", () => {
    const state = ledger();
    const start = new Date("2026-08-22T12:00:00.000Z");
    state.recordDeliberation(start);
    expect(state.permit("source-event", new Date("2026-08-22T12:00:30.000Z")).allowed).toBe(false);
    expect(state.permit("manual", new Date("2026-08-22T12:00:30.000Z")).allowed).toBe(true);
    for (let index = 1; index < ATTENTION_DAILY_LIMIT; index += 1)
      state.recordDeliberation(new Date(start.getTime() + index * 60_000));
    expect(state.permit("follow-up", new Date(start.getTime() + ATTENTION_DAILY_LIMIT * 60_000)).allowed).toBe(false);
    expect(state.permit("manual", new Date(start.getTime() + ATTENTION_DAILY_LIMIT * 60_000)).allowed).toBe(true);
  });

  it("removes resolved evidence from active watches", () => {
    const state = ledger();
    const now = new Date("2026-08-22T12:00:00.000Z");
    state.schedule({ action: "hold", reason: "Wait", sourceIds: ["one", "two"], followUpMinutes: 30 }, now);
    state.resolve("digest", "Ready", ["one"], new Date("2026-08-22T12:05:00.000Z"));
    expect(state.active(new Date("2026-08-22T12:06:00.000Z"))).toEqual([]);
  });
});
