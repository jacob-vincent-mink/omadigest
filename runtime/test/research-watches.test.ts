import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffResearchClaims, groupResearchClaimsByEvidence, researchDepthBudget, ResearchWatchStore } from "../src/research-watches.js";
import { createPinnedLookup, parseResearchSearchFeed, validateResearchUrl } from "../src/research-network.js";
import {
  isRelevantResearchDocument, isRelevantResearchQuery, isResearchEvidenceCurrent, isResearchFailureClaim,
  mergeResearchClaimLedger, minimumResearchRelevance, recencyAwareQuery, recencyWindowStart,
  researchEvidenceWindowStart, researchFreshnessInstruction,
  researchRelevanceScore
} from "../src/agent.js";
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
    expect(watch).toMatchObject({ depth: "broad", recency: "month" });
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
      [claim("deadline", "Entries close Tuesday"), claim("judging", "Judging starts Wednesday")],
      [{ key: "prize", reason: "The current rules removed the cash prize.", evidence: claim("rules", "Current rules").evidence }]
    );
    expect(changes.map((change) => [change.kind, change.key])).toEqual([
      ["changed", "deadline"], ["new", "judging"], ["no-longer-supported", "prize"]
    ]);
  });

  it("does not treat a missing claim as retired without explicit current evidence", () => {
    expect(diffResearchClaims([claim("model", "Model A is current")], [])).toEqual([]);
  });

  it("groups an atomic claim ledger into compact source-set topics", () => {
    const sameSource = [
      claim("gemini.launch", "Gemini launched"), claim("gemini.price", "Gemini pricing changed"),
      { ...claim("claude.launch", "Claude launched"), evidence: [{
        ...claim("claude.launch", "Claude launched").evidence[0]!, url: "https://example.com/claude"
      }] }
    ];
    expect(groupResearchClaimsByEvidence(sameSource).map((group) => group.map((item) => item.key)))
      .toEqual([["gemini.launch", "gemini.price"], ["claude.launch"]]);
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

  it("supports substantially broader bounded research profiles", () => {
    expect(researchDepthBudget("focused")).toMatchObject({ searches: 4, reads: 12 });
    expect(researchDepthBudget("broad")).toMatchObject({ searches: 10, reads: 30 });
    expect(researchDepthBudget("deep")).toMatchObject({ searches: 20, reads: 60 });
  });

  it("makes searches date-aware and narrows follow-ups to the prior snapshot", () => {
    const now = "2026-08-23T18:00:00.000Z";
    const prior = "2026-08-22T20:00:00.000Z";
    expect(researchFreshnessInstruction("month", now, prior)).toContain("since 2026-08-22");
    expect(recencyAwareQuery("frontier model releases", "month", now, prior))
      .toBe("frontier model releases latest current after:2026-08-22 before:2026-08-24");
    expect(researchFreshnessInstruction("anytime", now)).toContain("all-time evidence");
    expect(recencyWindowStart("week", now)?.toISOString()).toBe("2026-08-16T18:00:00.000Z");
    expect(researchEvidenceWindowStart("day", now, true)?.toISOString()).toBe("2026-07-24T18:00:00.000Z");
    expect(researchEvidenceWindowStart("day", now, false)?.toISOString()).toBe("2026-08-22T18:00:00.000Z");
    const start = new Date("2026-08-22T18:00:00.000Z");
    expect(isResearchEvidenceCurrent({ publishedAt: "2026-08-23T12:00:00.000Z" }, start, now)).toBe(true);
    expect(isResearchEvidenceCurrent({ publishedAt: "2027-01-01T00:00:00.000Z" }, start, now)).toBe(false);
  });

  it("bounds historical replay searches above and below the simulated as-of date", () => {
    const asOf = "2026-02-15T12:00:00.000Z";
    expect(recencyAwareQuery("kernel security advisories", "week", asOf))
      .toBe("kernel security advisories latest current after:2026-02-08 before:2026-02-16");
    expect(isResearchEvidenceCurrent(
      { publishedAt: "2026-02-12T00:00:00.000Z" }, new Date("2026-02-08T12:00:00.000Z"), asOf
    )).toBe(true);
    expect(isResearchEvidenceCurrent(
      { publishedAt: "2026-03-01T00:00:00.000Z" }, new Date("2026-02-08T12:00:00.000Z"), asOf
    )).toBe(false);
  });

  it("unwraps HTTPS sources from Bing News discovery results", () => {
    const feed = `<rss><channel><item><title>New model ships</title><link>http://www.bing.com/news/apiclick.aspx?ref=x&amp;url=https%3A%2F%2Fexample.com%2Fmodel</link><description>Current model release details.</description><pubDate>Sun, 23 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseResearchSearchFeed(feed, true)).toEqual([{
      title: "New model ships", url: "https://example.com/model", snippet: "Current model release details.",
      publishedAt: "2026-08-23T12:00:00.000Z"
    }]);
    expect(parseResearchSearchFeed(feed)[0]).not.toHaveProperty("publishedAt");
  });

  it("rejects irrelevant coverage and research-failure statements as current claims", () => {
    const subject = "Frontier model pulse proprietary and open-source AI model releases";
    expect(researchRelevanceScore(subject, "2026 calendar and holidays in the United States"))
      .toBeLessThan(minimumResearchRelevance(subject));
    expect(researchRelevanceScore(subject, "Open-source AI model release adds a larger context window"))
      .toBeGreaterThanOrEqual(minimumResearchRelevance(subject));
    expect(isRelevantResearchDocument(subject, {
      title: "August 2026 Calendar", text: "Open this source for context about the month."
    })).toBe(false);
    expect(isRelevantResearchDocument(subject, {
      title: "Open-weight model release", text: "A frontier AI lab published benchmark and context-window details."
    })).toBe(true);
    expect(isRelevantResearchDocument(subject, {
      title: "Introducing GPT-6", text: "Technical release details."
    }, "OpenAI releases a new frontier model with benchmark results.")).toBe(true);
    expect(isRelevantResearchQuery(subject, "August 2026 calendar")).toBe(false);
    expect(isRelevantResearchQuery(subject, "open-source model releases and benchmarks")).toBe(true);
    expect(isResearchFailureClaim("no_frontier_model_update", "No verified current-source evidence was obtained."))
      .toBe(true);
    expect(isResearchFailureClaim("august-context", "This evidence set is calendar context rather than model-change evidence."))
      .toBe(true);
    expect(isResearchFailureClaim("openai.model", "OpenAI released a new model with a larger context window."))
      .toBe(false);
  });

  it("updates depth and freshness without changing the schedule", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-research-"));
    roots.push(root);
    const env = { XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state"), HOME: root };
    const now = new Date("2026-08-23T12:00:00.000Z");
    const store = new ResearchWatchStore(env, now);
    const watch = store.create({ name: "Models", question: "What changed?", cadence: "daily", sourceUrls: [] }, now);
    const updated = store.updateResearchPolicy(watch.id, "deep", "week", new Date("2026-08-23T13:00:00.000Z"));
    expect(updated).toMatchObject({ depth: "deep", recency: "week", nextRunAt: watch.nextRunAt });
  });

  it("carries prior claims forward unless evidence explicitly retires them", () => {
    const prior = [claim("openai.current", "Model A is current"), claim("anthropic.current", "Model B is current")];
    expect(mergeResearchClaimLedger(prior, [claim("openai.current", "Model A2 is current")], []))
      .toEqual([claim("openai.current", "Model A2 is current"), claim("anthropic.current", "Model B is current")]);
    expect(mergeResearchClaimLedger(prior, [], ["openai.current"]))
      .toEqual([claim("anthropic.current", "Model B is current")]);
  });

  it.each([
    {
      topic: "frontier models",
      baseline: [claim("model.a", "Model A is current")],
      weekTwo: [claim("model.a", "Model A is current"), claim("model.b", "Model B launched")],
      omittedKey: "model.b"
    },
    {
      topic: "kernel advisories",
      baseline: [claim("kernel.cve", "CVE impact is high")],
      weekTwo: [claim("kernel.cve", "CVE impact is critical"), claim("kernel.fix", "The fix shipped")],
      omittedKey: "kernel.fix"
    },
    {
      topic: "competition rules",
      baseline: [claim("deadline", "Entries close Monday")],
      weekTwo: [claim("deadline", "Entries close Tuesday"), claim("judging", "Judging starts Friday")],
      omittedKey: "judging"
    }
  ])("replays weekly $topic rounds without inventing expiration", ({ baseline, weekTwo, omittedKey }) => {
    const firstChanges = diffResearchClaims(baseline, weekTwo);
    expect(firstChanges.some((change) => change.kind === "new" || change.kind === "changed")).toBe(true);

    const observedNextWeek = weekTwo.filter((candidate) => candidate.key !== omittedKey);
    const carried = mergeResearchClaimLedger(weekTwo, observedNextWeek, []);
    expect(carried.some((candidate) => candidate.key === omittedKey)).toBe(true);
    expect(diffResearchClaims(weekTwo, carried)).toEqual([]);

    const retirement = {
      key: omittedKey, reason: "A current primary source explicitly removed it.",
      evidence: claim("retirement", "The prior fact is no longer current").evidence
    };
    const afterRetirement = mergeResearchClaimLedger(carried, [], [omittedKey]);
    expect(diffResearchClaims(carried, afterRetirement, [retirement]))
      .toMatchObject([{ kind: "no-longer-supported", key: omittedKey }]);
  });

  it("preserves the last complete picture across partial runs and retries in one hour", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-research-"));
    roots.push(root);
    const env = { XDG_CONFIG_HOME: join(root, "config"), XDG_STATE_HOME: join(root, "state"), HOME: root };
    const now = new Date("2026-08-23T12:00:00.000Z");
    const store = new ResearchWatchStore(env, now);
    const watch = store.create({ name: "Models", question: "What changed?", cadence: "daily", sourceUrls: [] }, now);
    const complete: ResearchRun = {
      id: "15b1ba62-d7a1-48bc-94c9-9313d9aa6a7f", watchId: watch.id, watchName: watch.name,
      startedAt: now.toISOString(), completedAt: now.toISOString(), status: "complete", summary: "Baseline",
      baseline: true, meaningfulChange: false, claims: [claim("model", "Model A is current")], changes: []
    };
    store.record(complete, now);
    const partialAt = new Date("2026-08-23T13:00:00.000Z");
    store.record({
      ...complete, id: "85be61bd-cbf5-4e51-8277-bac5b609b4e0", startedAt: partialAt.toISOString(),
      completedAt: partialAt.toISOString(), status: "partial", summary: "Last good picture preserved", baseline: false
    }, partialAt);
    expect(store.latestRun(watch.id)?.id).toBe(complete.id);
    expect(store.get(watch.id)?.nextRunAt).toBe("2026-08-23T14:00:00.000Z");
    expect(store.resetBaseline(watch.id, partialAt)?.lastRunAt).toBeUndefined();
    expect(store.runs().filter((run) => run.watchId === watch.id)).toEqual([]);
  });
});
