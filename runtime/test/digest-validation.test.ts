import { describe, expect, it } from "vitest";
import { isSpecificDigestTitle } from "../src/digest-validation.js";

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
