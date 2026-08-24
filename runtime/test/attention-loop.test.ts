import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATTENTION_DAILY_LIMIT,
  AttentionLedger,
  validateAttentionProposal
} from "../src/attention-loop.js";
import type { AttentionProposal } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function ledger(): AttentionLedger {
  const root = mkdtempSync(join(tmpdir(), "omadigest-loop-"));
  roots.push(root);
  return new AttentionLedger({ XDG_STATE_HOME: root, HOME: root });
}

function hold(reason: string, sourceIds: string[], followUpMinutes: number): Extract<AttentionProposal, { action: "hold" }> {
  return {
    action: "hold" as const,
    reason,
    sourceIds,
    subject: "PR #42",
    wakeOn: ["new-evidence", "source-change", "deadline"],
    followUpMinutes
  };
}

describe("attention proposal validation", () => {
  const context = {
    availableSourceIds: new Set(["one", "two"]),
    currentSourceIds: new Set(["one", "two"]),
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
    expect(() => validateAttentionProposal(hold("Later", ["one"], 10),
      { ...context, manual: true })).toThrow("manual request");
  });

  it("enforces broker-owned digest and interruption thresholds", () => {
    expect(() => validateAttentionProposal({
      action: "digest", reason: "Minor", sourceIds: ["one"], templateId: "general"
    }, { ...context, allowDigest: false })).toThrow("stronger digest signal");
    expect(() => validateAttentionProposal({
      action: "notify", reason: "Minor", sourceIds: ["one"], headline: "Update", body: "Available", urgency: "normal"
    }, { ...context, allowNotify: false })).toThrow("interruption threshold");
  });

  it("requires current evidence even when historical memory is available", () => {
    expect(() => validateAttentionProposal({
      action: "digest", reason: "Historical only", sourceIds: ["memory-node"], templateId: "general"
    }, {
      ...context,
      availableSourceIds: new Set(["one", "memory-node"]),
      currentSourceIds: new Set(["one"])
    })).toThrow("current evidence");
  });
});

describe("AttentionLedger", () => {
  it("persists bounded watches and makes them due at the broker-owned time", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-loop-persist-"));
    roots.push(root);
    const env = { XDG_STATE_HOME: root, HOME: root };
    const first = new AttentionLedger(env);
    const now = new Date();
    const watch = first.schedule(hold("Wait for CI", ["pr-42"], 15), now);
    expect(first.due(new Date(now.getTime() + 15 * 60_000 - 1))).toEqual([]);
    expect(new AttentionLedger(env).due(new Date(now.getTime() + 15 * 60_000))[0]?.id).toBe(watch.id);
  });

  it("caps a watch at three follow-up attempts", () => {
    const state = ledger();
    let now = new Date("2026-08-22T12:00:00.000Z");
    let watch = state.schedule(hold("One", ["x"], 1), now);
    now = new Date("2026-08-22T12:01:00.000Z");
    watch = state.schedule(hold("Two", ["x"], 1), now, watch);
    now = new Date("2026-08-22T12:02:00.000Z");
    watch = state.schedule(hold("Three", ["x"], 1), now, watch);
    expect(() => state.schedule(hold("Four", ["x"], 1),
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
    state.schedule(hold("Wait", ["one", "two"], 30), now);
    state.resolve("digest", "Ready", ["one"], new Date("2026-08-22T12:05:00.000Z"));
    expect(state.active(new Date("2026-08-22T12:06:00.000Z"))).toEqual([]);
  });

  it("wakes a conditional lease on related evidence or a cited source changing", () => {
    const state = ledger();
    const now = new Date("2026-08-22T12:00:00.000Z");
    const watch = state.schedule(hold("Wait for CI", ["pr-42"], 30), now);
    const related = {
      id: "ci-42", source: "github", app: "GitHub", title: "CI changed on PR #42", body: "Checks are green",
      urgency: "normal" as const, occurredAt: new Date(now.getTime() + 60_000).toISOString()
    };
    const unrelated = { ...related, id: "ci-43", title: "CI changed on PR #43", body: "Checks failed" };
    expect(state.matching([related, unrelated], new Date(now.getTime() + 60_000))).toEqual([
      expect.objectContaining({ watch: expect.objectContaining({ id: watch.id }), sourceIds: ["ci-42"] })
    ]);
    expect(state.matching([{ ...related, id: "pr-42" }], new Date(now.getTime() + 120_000))[0]?.sourceIds).toEqual(["pr-42"]);
  });

  it("lets the user cancel a watch lease", () => {
    const state = ledger();
    const now = new Date("2026-08-22T12:00:00.000Z");
    const watch = state.schedule(hold("Wait", ["one"], 30), now);
    expect(state.cancel(watch.id, now)?.subject).toBe("PR #42");
    expect(state.active(now)).toEqual([]);
  });

  it("hides a watch without cancelling it and lets the user restore it", () => {
    const state = ledger();
    const now = new Date("2026-08-22T12:00:00.000Z");
    const watch = state.schedule(hold("Wait", ["one"], 30), now);
    const hidden = state.dismiss(watch.id, new Date("2026-08-22T12:01:00.000Z"));
    expect(hidden?.hiddenAt).toBe("2026-08-22T12:01:00.000Z");
    expect(state.active(now)).toHaveLength(1);
    expect(state.show(watch.id, new Date("2026-08-22T12:02:00.000Z"))?.hiddenAt).toBeUndefined();
    expect(state.active(now)[0]?.hiddenAt).toBeUndefined();
  });

  it("surfaces a hidden watch again when the agent schedules its next review", () => {
    const state = ledger();
    const now = new Date("2026-08-22T12:00:00.000Z");
    const watch = state.schedule(hold("Wait", ["one"], 1), now);
    state.dismiss(watch.id, new Date("2026-08-22T12:00:30.000Z"));
    const rescheduled = state.schedule(hold("Keep waiting", ["one"], 10),
      new Date("2026-08-22T12:01:00.000Z"), state.get(watch.id));
    expect(rescheduled.hiddenAt).toBeUndefined();
  });
});
