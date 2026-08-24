import { describe, expect, it } from "vitest";
import { isSpecificDigestTitle, validateDigestEvidence } from "../src/digest-validation.js";
import type { DigestEntry, EvidenceGroup } from "../src/types.js";

describe("digest title validation", () => {
  it("rejects generic and template-only titles", () => {
    expect(isSpecificDigestTitle("Today's digest", "Focus Re-entry")).toBe(false);
    expect(isSpecificDigestTitle("Daily briefing", "Focus Re-entry")).toBe(false);
    expect(isSpecificDigestTitle("Focus Re-entry", "Focus Re-entry")).toBe(false);
    expect(isSpecificDigestTitle("Focus Re-entry Report", "Focus Re-entry")).toBe(false);
  });

  it("accepts evidence-specific titles", () => {
    expect(isSpecificDigestTitle("PR #482 Report", "GitHub PR Report")).toBe(true);
    expect(isSpecificDigestTitle("Release Readiness: CI and Review Blockers", "Focus Re-entry")).toBe(true);
  });
});

describe("digest evidence validation", () => {
  const entry = (sourceIds: string[]): DigestEntry => ({
    headline: "Headline", explanation: "Explanation", importance: "normal", confidence: 1, sourceIds
  });
  const groups = [{
    id: "group-1", kind: "entity", intent: "review", subject: "pr-482", reason: "shared-reference",
    sourceIds: ["one", "two"], items: []
  }] satisfies EvidenceGroup[];

  it("rejects split groups and reused evidence", () => {
    expect(validateDigestEvidence([entry(["one"]), entry(["two"])], groups)).toContain("summarized together");
    expect(validateDigestEvidence([entry(["one"]), entry(["one"])], groups)).toContain("only one digest entry");
  });

  it("accepts one merged entry", () => {
    expect(validateDigestEvidence([entry(["one", "two"])], groups)).toBeUndefined();
  });

  it("requires a used correlation block to retain all of its provenance", () => {
    expect(validateDigestEvidence([entry(["one"])], groups)).toContain("complete block");
    expect(validateDigestEvidence([], groups)).toBeUndefined();
  });

  it("rejects model-facing compilation chatter", () => {
    expect(validateDigestEvidence([{
      ...entry(["one", "two"]), explanation: "These updates are one combined outcome."
    }], groups)).toContain("compilation process");
  });
});
