import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TemplateSuggestionStore } from "../src/template-suggestion-store.js";

describe("TemplateSuggestionStore", () => {
  it("persists bounded dismissals for 30 days", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-suggestions-"));
    const env = { XDG_STATE_HOME: root, HOME: root };
    const now = new Date("2026-08-20T12:00:00.000Z");
    const store = new TemplateSuggestionStore(env);
    store.dismiss("github-review-queue", now);
    expect(new TemplateSuggestionStore(env).active(new Date("2026-08-21T12:00:00.000Z")).has("github-review-queue")).toBe(true);
    expect(new TemplateSuggestionStore(env).active(new Date("2026-09-21T12:00:00.000Z")).has("github-review-queue")).toBe(false);
  });
});
