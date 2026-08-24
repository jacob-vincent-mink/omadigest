import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffResearchClaims, ResearchWatchStore } from "../src/research-watches.js";
import { createPinnedLookup, validateResearchUrl } from "../src/research-network.js";
import type { ResearchClaim, ResearchRun } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function claim(key: string, statement: string): ResearchClaim {
  return {
    key, statement, significance: "Worth tracking", confidence: 0.9,
    evidence: [{
      url: "https://example.com/news", title: "Example", retrievedAt: "2026-08-23T12:00:00.000Z",
      excerptHash: "a".repeat(64)
    }]
  };
}

describe("ResearchWatchStore", () => {
  it("persists bounded schedules and advances a completed watch", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-research-"));
    roots.push(root);
    const env = { XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state"), HOME: root };
    const now = new Date("2026-08-23T12:00:00.000Z");
    const store = new ResearchWatchStore(env, now);
    const watch = store.create({
      name: "Plugin competition", question: "What changed in the Omarchy plugin competition?",
      cadence: "daily", sourceUrls: ["https://omarchy.org/news/"]
    }, now);
    expect(store.due(now)).toHaveLength(1);
    const run: ResearchRun = {
      id: "15b1ba62-d7a1-48bc-94c9-9313d9aa6a7f", watchId: watch.id, watchName: watch.name,
      startedAt: now.toISOString(), completedAt: now.toISOString(), status: "complete", summary: "Baseline",
      baseline: true, meaningfulChange: false, claims: [claim("deadline", "Entries close Monday")], changes: []
    };
    store.record(run, now);
    const restored = new ResearchWatchStore(env, now);
    expect(restored.watches()[0]).toMatchObject({ name: "Plugin competition", enabled: true, lastRunAt: now.toISOString() });
    expect(restored.due(new Date("2026-08-24T11:59:59.000Z"))).toHaveLength(0);
    expect(restored.due(new Date("2026-08-24T12:00:00.000Z"))).toHaveLength(1);
    expect(restored.latestRun(watch.id)?.claims[0]?.key).toBe("deadline");
  });

  it("detects new, changed, and no-longer-supported claims deterministically", () => {
    const changes = diffResearchClaims(
      [claim("deadline", "Entries close Monday."), claim("prize", "Prize is $1,000")],
      [claim("deadline", "Entries close Tuesday"), claim("judging", "Judging starts Wednesday")]
    );
    expect(changes.map((change) => [change.kind, change.key])).toEqual([
      ["changed", "deadline"], ["new", "judging"], ["no-longer-supported", "prize"]
    ]);
  });

  it("accepts only credential-free HTTPS research sources", () => {
    expect(validateResearchUrl("https://example.com/feed").hostname).toBe("example.com");
    expect(() => validateResearchUrl("http://127.0.0.1/private")).toThrow("credential-free HTTPS");
    expect(() => validateResearchUrl("https://user:secret@example.com/private")).toThrow("credential-free HTTPS");
  });

  it("returns the DNS result shape requested by current Node HTTPS", () => {
    const pinned = createPinnedLookup("1.1.1.1", 4);
    let single: unknown;
    let all: unknown;
    pinned("example.com", { all: false }, (_error, address) => { single = address; });
    pinned("example.com", { all: true }, (_error, addresses) => { all = addresses; });
    expect(single).toBe("1.1.1.1");
    expect(all).toEqual([{ address: "1.1.1.1", family: 4 }]);
  });
});
