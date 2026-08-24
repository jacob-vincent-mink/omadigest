import { describe, expect, it } from "vitest";
import {
  MAX_DIGEST_SOURCES,
  attachDigestSources,
  resolveDigestEntrySources,
  safeDigestSourceUrl,
  sourceRecords
} from "../src/digest-sources.js";
import type { AttentionItem, Digest } from "../src/types.js";

const digest = (sourceIds: string[]): Digest => ({
  id: "00000000-0000-4000-8000-000000000010",
  templateId: "general",
  title: "Source report",
  generatedAt: "2026-08-24T12:00:00.000Z",
  sections: [{
    title: "Act now",
    entries: [{ headline: "Review", explanation: "Details", importance: "normal", confidence: 1, sourceIds }]
  }]
});

const item = (id: string, overrides: Partial<AttentionItem> = {}): AttentionItem => ({
  id,
  source: "notifications",
  app: "Signal",
  title: "A notification",
  body: "Details",
  urgency: "normal",
  occurredAt: "2026-08-24T11:55:00.000Z",
  ...overrides
});

describe("digest source references", () => {
  it("snapshots only cited HTTPS and application destinations", () => {
    const enriched = attachDigestSources(digest(["web", "notification"]), [
      item("web", { source: "github", app: "GitHub", urls: ["https://github.com/acme/repo/pull/42"] }),
      item("notification"),
      item("uncited", { source: "research", urls: ["https://example.com/unused"] })
    ]);
    expect(enriched.sources).toEqual([
      expect.objectContaining({ sourceId: "web", targetId: "web-0", kind: "web", destination: "github.com" }),
      expect.objectContaining({ sourceId: "notification", targetId: "application", kind: "application", appTarget: "Signal" })
    ]);
  });

  it("recovers old digest sources from retained evidence and says when they expired", () => {
    const oldDigest = digest(["available", "gone"]);
    const sources = resolveDigestEntrySources(oldDigest, oldDigest.sections[0]!.entries[0]!, [
      item("available", { source: "research", app: "Model pulse", urls: ["https://example.com/current"] })
    ]);
    expect(sources[0]).toMatchObject({ sourceId: "available", kind: "web", destination: "example.com" });
    expect(sources[1]).toMatchObject({ sourceId: "gone", kind: "expired", message: expect.stringContaining("expired") });
  });

  it("rejects unsafe locators and bounds persisted references", () => {
    expect(safeDigestSourceUrl("file:///etc/passwd")).toBeUndefined();
    expect(safeDigestSourceUrl("http://example.com/plaintext")).toBeUndefined();
    expect(safeDigestSourceUrl("https://user:secret@example.com/private")).toBeUndefined();
    const ids = Array.from({ length: MAX_DIGEST_SOURCES + 20 }, (_, index) => `source-${index}`);
    const enriched = attachDigestSources(digest(ids), ids.map((id, index) =>
      item(id, { source: "research", app: "Research", urls: [`https://example.com/${index}`] })));
    expect(enriched.sources).toHaveLength(MAX_DIGEST_SOURCES);
  });

  it("recovers retained HTTPS pages from legacy research evidence", () => {
    const records = sourceRecords(item("legacy", {
      source: "omadigest.research", app: "Model pulse", title: "A verified update",
      body: "Sources:\nhttps://example.com/research/update."
    }));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "web", url: "https://example.com/research/update" });
  });
});
