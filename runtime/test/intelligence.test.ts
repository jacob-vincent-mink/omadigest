import { describe, expect, it } from "vitest";
import {
  automaticDigestDecision,
  classifyAttentionItem,
  groupAttentionItems,
  suggestTemplates
} from "../src/intelligence.js";
import type { AttentionItem, DigestTemplate, GenerationContext } from "../src/types.js";

const now = "2026-08-20T12:00:00.000Z";
const item = (id: string, title: string, overrides: Partial<AttentionItem> = {}): AttentionItem => ({
  id, source: "notifications", app: "GitHub", title, body: "", urgency: "normal", occurredAt: now, ...overrides
});
const context = (trigger: GenerationContext["trigger"], focusMinutes = 0): GenerationContext => ({
  trigger, focusMinutes, itemCount: 0, appCounts: {}, intentCounts: {},
  urgencyCounts: { low: 0, normal: 0, critical: 0 }, availableConnectors: ["notifications"], now
});

describe("attention intelligence", () => {
  it("classifies bounded notification intent without treating text as instructions", () => {
    expect(classifyAttentionItem(item("1", "PR #482 review requested")).intent).toBe("review");
    expect(classifyAttentionItem(item("2", "Deploy failed")).intent).toBe("failure");
    expect(classifyAttentionItem(item("3", "Secret", { contentAvailable: false })).intent).toBeUndefined();
  });

  it("groups shared references but leaves unrelated titles separate", () => {
    const groups = groupAttentionItems([
      item("1", "PR #482 review requested"),
      item("2", "New feedback on PR #482"),
      item("3", "PR #918 review requested")
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.sourceIds.includes("1"))?.sourceIds).toEqual(["1", "2"]);
  });

  it("does not group generic same-title notifications", () => {
    expect(groupAttentionItems([item("1", "New message"), item("2", "New message")])).toHaveLength(2);
  });

  it("does not generate on a brief low-signal DND toggle", () => {
    expect(automaticDigestDecision(context("dnd-ended", 1), [item("1", "Build completed")])).toMatchObject({ generate: false });
    expect(automaticDigestDecision(context("dnd-ended", 1), [item("1", "Deploy failed", { urgency: "critical" })])).toMatchObject({ generate: true });
  });

  it("generates after meaningful focus when several items include action", () => {
    const items = [item("1", "PR #1 review requested"), item("2", "Docs published"), item("3", "Release updated")];
    expect(automaticDigestDecision(context("dnd-ended", 12), items)).toMatchObject({ generate: true });
  });

  it("suggests only fixed recipes supported by repeated safe evidence", () => {
    const items = [1, 2, 3, 4].map((number) => item(String(number), `PR #${number} review requested`));
    expect(suggestTemplates(items, [], new Set(), new Date(now))[0]).toMatchObject({ id: "github-review-queue", itemCount: 4 });
    const covered = [{ manifest: { id: "github-triage", name: "GitHub Triage", description: "GitHub", match: {} } }] as DigestTemplate[];
    expect(suggestTemplates(items, covered, new Set(), new Date(now))).toEqual([]);
  });

  it("can suggest a fixed connector-backed recipe from count-only app frequency", () => {
    const hidden = [1, 2, 3, 4, 5, 6].map((number) => item(String(number), "", { body: "", contentAvailable: false }));
    expect(suggestTemplates(hidden, [], new Set(), new Date(now))[0]).toMatchObject({ id: "github-activity", itemCount: 6 });
  });
});
