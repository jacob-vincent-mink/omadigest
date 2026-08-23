import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AttentionPolicyStore, attentionPolicyDraftSchema } from "../src/attention-policy.js";
import type { AttentionItem } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "ci-184", source: "github", app: "GitHub", title: "CI failed for jacob/omadigest PR #184",
    body: "Production checks failed", urgency: "critical", occurredAt: "2026-08-23T12:00:00.000Z", ...overrides
  };
}

describe("AttentionPolicyStore", () => {
  it("persists, prioritizes, toggles, and deletes bounded standing policies", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-policy-"));
    roots.push(root);
    const env = { XDG_CONFIG_HOME: root, HOME: root };
    const store = new AttentionPolicyStore(env);
    const digest = store.add({
      name: "Production failures", description: "Bundle production failures", priority: 80,
      action: "digest", match: { intents: ["failure"], contains: ["production"] }, templateId: "general"
    }, new Date("2026-08-23T12:00:00.000Z"));
    store.add({
      name: "Critical interruption", description: "Interrupt for critical failures", priority: 95,
      action: "notify", match: { urgencies: ["critical"], intents: ["failure"] }
    }, new Date("2026-08-23T12:01:00.000Z"));
    expect(store.evaluate([fixture()]).map((match) => match.policy.action)).toEqual(["notify", "digest"]);
    store.setEnabled(digest.id, false);
    expect(new AttentionPolicyStore(env).evaluate([fixture()]).map((match) => match.policy.action)).toEqual(["notify"]);
    expect(store.delete(digest.id)).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it("matches stable entities across applications", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-policy-entity-"));
    roots.push(root);
    const store = new AttentionPolicyStore({ XDG_CONFIG_HOME: root, HOME: root });
    store.add({
      name: "PR 184", description: "Keep one PR together", priority: 50, action: "hold",
      match: { entities: ["work:jacob/omadigest:pr:184"] }, followUpMinutes: 30
    });
    expect(store.evaluate([fixture({ source: "ci", app: "Buildkite" })])).toHaveLength(1);
  });

  it("rejects broad interruption policies", () => {
    expect(() => attentionPolicyDraftSchema.parse({
      name: "Everything", description: "Interrupt for every update", priority: 100,
      action: "notify", match: { intents: ["update"] }
    })).toThrow("Notify policies");
  });

  it("previews current matches and deterministic priority conflicts without persisting", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-policy-preview-"));
    roots.push(root);
    const store = new AttentionPolicyStore({ XDG_CONFIG_HOME: root, HOME: root });
    store.add({
      name: "Critical interruption", description: "Interrupt for critical failures", priority: 90,
      action: "notify", match: { applications: ["GitHub"], intents: ["failure"] }
    });
    const preview = store.preview({
      name: "Failure report", description: "Digest GitHub failures", priority: 70,
      action: "digest", match: { applications: ["GitHub"], intents: ["failure"] }, templateId: "general"
    }, [fixture()]);
    expect(preview).toMatchObject({
      matchedCount: 1,
      examples: [{ id: "ci-184", app: "GitHub" }],
      conflicts: [{ name: "Critical interruption", action: "notify", winner: "existing" }]
    });
    expect(store.list()).toHaveLength(1);
  });
});
