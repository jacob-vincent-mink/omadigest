import { describe, expect, it } from "vitest";
import { scoreAttentionReplay } from "../src/attention-replay.js";

describe("attention replay scoring", () => {
  it("scores grouping, interruptions, missed urgency, and empty model calls", () => {
    const score = scoreAttentionReplay({
      name: "PR stream",
      items: [
        { id: "gh", source: "github", app: "GitHub", title: "Review jacob/omadigest PR #184", body: "Review requested", urgency: "normal", occurredAt: "2026-08-23T12:00:00.000Z" },
        { id: "ci", source: "ci", app: "Buildkite", title: "CI failed on jacob/omadigest PR #184", body: "A check failed", urgency: "critical", occurredAt: "2026-08-23T12:01:00.000Z" },
        { id: "noise", source: "notifications", app: "Feed", title: "Routine update", body: "Available", urgency: "low", occurredAt: "2026-08-23T12:02:00.000Z" }
      ],
      decisions: [
        { at: "2026-08-23T12:03:00.000Z", action: "digest", sourceIds: ["gh", "ci"], modelCall: true },
        { at: "2026-08-23T12:04:00.000Z", action: "error", sourceIds: [], modelCall: true }
      ]
    });
    expect(score).toMatchObject({
      items: 3, groupedSubjects: 2, correlatedItems: 2, usefulGroupingRate: 0.6667,
      interruptions: 0, missedCritical: 0, modelCalls: 2, unnecessaryModelCalls: 1
    });
  });
});
