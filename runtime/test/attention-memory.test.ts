import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ATTENTION_TIMELINE_MAX_BYTES, AttentionMemory } from "../src/attention-memory.js";
import type { AttentionItem, Digest } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function store(): { memory: AttentionMemory; env: NodeJS.ProcessEnv } {
  const root = mkdtempSync(join(tmpdir(), "omadigest-memory-"));
  roots.push(root);
  const env = { XDG_STATE_HOME: root, HOME: root };
  return { memory: new AttentionMemory(env), env };
}

function item(id: string, title: string, at: string, source = "notifications", app = "GitHub"): AttentionItem {
  return {
    id, source, app, title, body: `${title} details`, contentAvailable: true,
    urgency: "normal", occurredAt: at
  };
}

describe("AttentionMemory", () => {
  it("persists searchable, provenance-preserving episodes", () => {
    const { memory, env } = store();
    const now = new Date("2026-08-23T12:00:00.000Z");
    const evidence = [item("pr-184", "Review requested on PR #184", now.toISOString())];
    memory.recordEvidence(evidence, now);
    memory.recordDecision("hold", "Wait for CI", evidence, "PR #184", now);
    const digest: Digest = {
      id: "5ef4f768-2649-4d3a-8a62-dd3a8fed669c",
      templateId: "general",
      title: "PR #184 report",
      generatedAt: new Date(now.getTime() + 60_000).toISOString(),
      sections: [{ title: "Needs you", entries: [{
        headline: "Review PR #184", explanation: "A review is waiting.", importance: "high",
        sourceIds: ["pr-184"], confidence: 0.95
      }] }]
    };
    memory.recordDigest(digest, evidence);

    const reloaded = new AttentionMemory(env);
    const results = reloaded.search({ query: "PR #184", limit: 8 }, new Date("2026-08-23T13:00:00.000Z"));
    expect(results.map((result) => result.episodeKinds[0])).toEqual(expect.arrayContaining(["evidence", "decision", "digest"]));
    expect(results.every((result) => result.sourceIds.includes("pr-184"))).toBe(true);
    expect(reloaded.status().episodeCount).toBe(3);
    expect(new AttentionMemory(env).byIds([results[0]!.id])[0]).toMatchObject({
      source: "omadigest.memory", title: results[0]!.subject
    });
  });

  it("builds a bounded time-decayed cover that can zoom back toward episodes", () => {
    const { memory } = store();
    const start = Date.parse("2026-08-20T00:00:00.000Z");
    for (let batch = 0; batch < 4; batch += 1) {
      const items = Array.from({ length: 10 }, (_, offset) => {
        const index = batch * 10 + offset;
        return item(`event-${index}`, `Repository event ${index}`, new Date(start + index * 60_000).toISOString(), "github", "GitHub");
      });
      memory.recordEvidence(items, new Date(start + (batch * 10 + 9) * 60_000));
    }
    const cover = memory.cover(8);
    expect(cover).toHaveLength(8);
    expect(cover.reduce((total, node) => total + node.episodeCount, 0)).toBe(40);
    expect(cover.at(-1)!.episodeCount).toBeLessThanOrEqual(cover[0]!.episodeCount);
    const summary = cover.find((node) => node.kind === "summary")!;
    const children = memory.zoom(summary.id);
    expect(children).toHaveLength(2);
    expect(children[0]!.episodeCount + children[1]!.episodeCount).toBe(summary.episodeCount);
    expect(memory.byIds([children[0]!.id])[0]).toMatchObject({ source: "omadigest.memory", contentAvailable: true });
  });

  it("cascades privacy and history deletion through derived memory", () => {
    const { memory } = store();
    const now = new Date("2026-08-23T12:00:00.000Z");
    memory.recordEvidence([
      item("mail", "Private mail", now.toISOString(), "notifications", "Mail"),
      item("github", "PR #9 review", now.toISOString(), "notifications", "GitHub"),
      item("calendar", "Planning event", now.toISOString(), "calendar", "Calendar")
    ], now);
    const mailNode = memory.search({ query: "Private mail" }, now)[0]!;
    const recalledMail = memory.byIds([mailNode.id]);
    memory.recordDigest({
      id: "5be02fb6-a765-4aeb-bd8a-0ad3ab3e2ca0", templateId: "general", title: "Mail follow-up",
      generatedAt: now.toISOString(), sections: []
    }, recalledMail);
    memory.applyNotificationPolicy((app) => app === "GitHub");
    expect(memory.search({ query: "Private mail" }, now)).toEqual([]);
    expect(memory.search({ query: "Mail follow-up" }, now)).toEqual([]);
    expect(memory.search({ query: "PR #9" }, now)).toHaveLength(1);
    expect(memory.search({ query: "Planning event" }, now)).toHaveLength(1);
    memory.clearNotifications();
    expect(memory.search({ query: "PR #9" }, now)).toEqual([]);
    expect(memory.search({ query: "Planning event" }, now)).toHaveLength(1);
  });

  it("derives bounded soft preferences only from observable outcomes", () => {
    const { memory } = store();
    const now = new Date("2026-08-23T12:00:00.000Z");
    const evidence = [item("pr-184", "Review jacob/omadigest PR #184", now.toISOString(), "github", "GitHub")];
    memory.recordEvidence(evidence, now);
    memory.recordOutcome("useful", "PR #184 report", ["pr-184"], undefined, new Date(now.getTime() + 60_000));
    memory.recordOutcome("handoff", "Review PR #184", ["pr-184"], undefined, new Date(now.getTime() + 120_000));
    expect(memory.preferenceHints(evidence, new Date(now.getTime() + 180_000))[0]).toMatchObject({
      signal: "surface", sampleSize: 2
    });

    memory.recordOutcome("not-useful", "PR #184 report", ["pr-184"], undefined, new Date(now.getTime() + 240_000));
    memory.recordOutcome("not-useful", "PR #184 report", ["pr-184"], undefined, new Date(now.getTime() + 300_000));
    memory.recordOutcome("not-useful", "PR #184 report", ["pr-184"], undefined, new Date(now.getTime() + 360_000));
    expect(memory.preferenceHints(evidence, new Date(now.getTime() + 420_000))[0]).toMatchObject({
      signal: "defer", sampleSize: 5
    });
    expect(memory.calibration()).toMatchObject({
      outcomeCount: 5,
      handoffCount: 1,
      usefulCount: 1,
      notUsefulCount: 3,
      subjects: [expect.objectContaining({ signal: "defer", sampleSize: 5 })]
    });
  });

  it("projects correlated subject threads as a stable paged event timeline", () => {
    const { memory } = store();
    const now = new Date("2026-08-23T12:00:00.000Z");
    const evidence = [item("pr-184", "Review jacob/omadigest PR #184", now.toISOString(), "github", "GitHub")];
    memory.recordEvidence(evidence, now);
    memory.recordDecision("hold", "Wait for CI on PR #184", evidence, "PR #184", now);
    memory.recordDigest({
      id: "5ef4f768-2649-4d3a-8a62-dd3a8fed669c", templateId: "general", title: "PR #184 report",
      generatedAt: now.toISOString(), sections: []
    }, evidence);
    memory.recordOutcome("read", "PR #184 report", ["pr-184"], "5ef4f768-2649-4d3a-8a62-dd3a8fed669c", now);

    const first = memory.timeline({ mode: "events", limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();
    const second = memory.timeline({ mode: "events", limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(2);
    expect(new Set([...first.items, ...second.items].map((entry) => entry.id)).size).toBe(4);
    expect(new Set([...first.items, ...second.items].map((entry) => entry.threadId)).size).toBe(1);
    expect([...first.items, ...second.items].find((entry) => entry.action === "read")?.summary)
      .toBe("PR #184 report");
    expect(first.threads[0]).toMatchObject({ episodeCount: 4, sourceCount: 1 });
    expect(memory.thread(first.threads[0]!.id).map((node) => node.episodeKinds[0]))
      .toEqual(expect.arrayContaining(["evidence", "decision", "digest", "outcome"]));
    expect(memory.thread("thread-000000000000000000000000")).toEqual([]);
    expect(memory.timeline({ mode: "events", cursor: "not-a-cursor" })).toMatchObject({ items: [], hasMore: false });
  });

  it("filters and progressively reveals a bounded memory timeline", () => {
    const { memory } = store();
    const start = Date.parse("2026-08-20T00:00:00.000Z");
    const evidence = Array.from({ length: 30 }, (_, index) => item(
      `pr-${index}`, `Review jacob/omadigest PR #184 update ${index} ${"detail ".repeat(100)}`,
      new Date(start + index * 60_000).toISOString(), "github", "GitHub"
    ));
    for (const entry of evidence) memory.recordEvidence([entry], new Date(entry.occurredAt));
    const events = memory.timeline({ mode: "events", limit: 4 });
    const threadId = events.threads[0]!.id;
    const memoryPage = memory.timeline({ mode: "memory", threadId, limit: 4 });
    expect(memoryPage.items).toHaveLength(4);
    expect(memoryPage.items.reduce((total, entry) => total + entry.episodeCount, 0)).toBe(30);
    expect(Buffer.byteLength(JSON.stringify(memoryPage.items), "utf8")).toBeLessThanOrEqual(ATTENTION_TIMELINE_MAX_BYTES);
    const summary = memoryPage.items.find((entry) => entry.expandable)!;
    const children = memory.timelineZoom(summary.memoryNodeId!);
    expect(children).toHaveLength(2);
    expect(children.reduce((total, entry) => total + entry.episodeCount, 0)).toBe(summary.episodeCount);
  });

  it("keeps an existing thread identifier when later evidence adds a stronger entity", () => {
    const { memory } = store();
    const now = new Date("2026-08-23T12:00:00.000Z");
    const evidence = [item("build-1", "Build needs review", now.toISOString(), "github", "GitHub")];
    memory.recordEvidence(evidence, now);
    const original = memory.timeline({ mode: "events" }).threads[0]!.id;
    memory.recordDecision("hold", "Wait for CI on jacob/omadigest PR #184", evidence, "PR #184", new Date(now.getTime() + 60_000));
    const updated = memory.timeline({ mode: "events" }).threads[0]!;
    expect(updated.id).toBe(original);
    expect(updated.episodeCount).toBe(2);
  });
});
