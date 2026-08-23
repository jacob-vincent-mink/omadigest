import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AttentionStore } from "../src/attention.js";
import { PrivacyPolicy } from "../src/privacy.js";
import type { AttentionItem } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(app: string): AttentionItem {
  return {
    id: `notification:${app}`, source: "notifications", app,
    title: "Private title", body: "Private body", urgency: "normal",
    occurredAt: "2026-08-20T11:00:00.000Z"
  };
}

describe("PrivacyPolicy", () => {
  it("ignores protected apps and erases unknown notification content by default", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-privacy-"));
    roots.push(root);
    const policy = new PrivacyPolicy(root);
    expect(policy.filter(fixture("Signal"))).toBeUndefined();
    const countOnly = policy.filter(fixture("GitHub"));
    expect(countOnly).toMatchObject({ app: "GitHub", title: "", body: "", contentAvailable: false });
    expect(countOnly?.occurredAt).toBe("2026-08-20T11:00:00.000Z");
    expect(policy.evidenceForDigest([countOnly!])).toEqual([]);
  });

  it("counts only model-eligible evidence as digestible", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-privacy-"));
    roots.push(root);
    const policy = new PrivacyPolicy(root);
    const hidden = policy.filter(fixture("Unknown app"));
    policy.setRule("GitHub", "digest");
    const visible = policy.filter(fixture("GitHub"));
    expect([hidden, visible]).toHaveLength(2);
    expect(policy.evidenceForDigest([hidden!, visible!]).map((item) => item.app)).toEqual(["GitHub"]);
  });

  it("does not let newer private counts crowd eligible evidence out of a digest", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-privacy-"));
    roots.push(root);
    const policy = new PrivacyPolicy(root);
    policy.setRule("GitHub", "digest");
    const visible = policy.filter(fixture("GitHub"))!;
    const hidden = Array.from({ length: 40 }, (_, index) => policy.filter({
      ...fixture(`Unknown ${index}`), id: `hidden-${index}`
    })!);
    const selected = policy.selectDigestEvidence([...hidden, visible], 1);
    expect(selected.items.map((item) => item.app)).toEqual(["GitHub"]);
    expect(selected.excludedIds).toHaveLength(40);
  });

  it("persists explicit digest and handoff permissions", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-privacy-"));
    roots.push(root);
    const policy = new PrivacyPolicy(root);
    policy.setRule("GitHub", "digest");
    expect(policy.filter(fixture("GitHub"))?.body).toBe("Private body");
    expect(policy.evidenceForDigest([fixture("GitHub")])).toHaveLength(1);
    expect(policy.evidenceForHandoff([fixture("GitHub")])).toEqual([]);
    policy.setRule("GitHub", "digest-and-handoff");
    expect(new PrivacyPolicy(root).evidenceForHandoff([fixture("GitHub")])[0]?.body).toBe("Private body");
  });

  it("deletes user rules and restores the correct application fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-privacy-"));
    roots.push(root);
    const policy = new PrivacyPolicy(root);
    policy.setRule("GitHub", "digest");
    policy.setRule("Signal", "digest-and-handoff");
    policy.deleteRule("GitHub");
    policy.deleteRule("Signal");
    const reloaded = new PrivacyPolicy(root);
    expect(reloaded.filter(fixture("GitHub"))).toMatchObject({ title: "", body: "", contentAvailable: false });
    expect(reloaded.filter(fixture("Signal"))).toBeUndefined();
    expect(reloaded.status().rules.find((rule) => rule.app === "Signal")).toMatchObject({
      mode: "ignore", source: "protected-default"
    });
    expect(reloaded.status().rules.some((rule) => rule.app === "github")).toBe(false);
  });

  it("retroactively removes or sanitizes retained notification evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-privacy-state-"));
    roots.push(root);
    const attention = new AttentionStore({ XDG_STATE_HOME: root, HOME: root });
    attention.ingest([fixture("Signal"), fixture("GitHub")]);
    const policy = new PrivacyPolicy(join(root, "config"));
    attention.applyPolicy((item) => policy.filter(item));
    expect(attention.byIds(["notification:Signal"])).toEqual([]);
    expect(attention.byIds(["notification:GitHub"])[0]).toMatchObject({ title: "", body: "", contentAvailable: false });
    const eventsDir = join(root, "omadigest", "events");
    const segment = readFileSync(join(eventsDir, readdirSync(eventsDir)[0]!), "utf8");
    expect(segment).not.toContain("Private body");
  });

  it("recovers the temporary global policy format without broadening access", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-privacy-v2-"));
    roots.push(root);
    const path = join(root, "privacy.json");
    writeFileSync(path, JSON.stringify({ version: 2, nativeMode: "count-only" }));
    const policy = new PrivacyPolicy(root);
    expect(policy.filter(fixture("GitHub"))).toMatchObject({ title: "", body: "", contentAvailable: false });
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ version: 1, defaultMode: "count-only", applications: {} });
  });
});
