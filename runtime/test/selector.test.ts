import { describe, expect, it } from "vitest";
import { selectTemplate } from "../src/selector.js";
import type { DigestTemplate, GenerationContext } from "../src/types.js";

function template(id: string, priority: number, match: DigestTemplate["manifest"]["match"]): DigestTemplate {
  return {
    directory: `/templates/${id}`,
    instructions: `Instructions for ${id}`,
    manifest: {
      version: 1,
      id,
      name: id,
      description: id,
      priority,
      match,
      context: { connectors: ["notifications"], maximumItems: 40, maximumBytes: 50_000 },
      output: { sections: ["Now"], maximumEntries: 10 }
    }
  };
}

const base: GenerationContext = {
  trigger: "manual",
  itemCount: 5,
  focusMinutes: 0,
  appCounts: { github: 3, signal: 2 },
  availableConnectors: ["notifications", "github"],
  now: "2026-08-20T12:00:00.000Z"
};

describe("selectTemplate", () => {
  it("falls back to the general template", () => {
    expect(selectTemplate([template("general", 10, {})], base).templateId).toBe("general");
  });

  it("prefers a high-priority matching focus template", () => {
    const context = { ...base, trigger: "dnd-ended" as const, focusMinutes: 45 };
    const selected = selectTemplate([
      template("general", 10, {}),
      template("focus-reentry", 80, { triggers: ["dnd-ended"], minimumItems: 3, minimumFocusMinutes: 30 })
    ], context);
    expect(selected.templateId).toBe("focus-reentry");
    expect(selected.reasons).toContain("focus lasted 45 minutes");
  });

  it("does not select an app template below its share threshold", () => {
    const selected = selectTemplate([
      template("general", 10, {}),
      template("engineering", 90, { applications: ["github"], minimumApplicationShare: 0.8 })
    ], base);
    expect(selected.templateId).toBe("general");
  });

  it("requires declared connectors", () => {
    const selected = selectTemplate([
      template("general", 10, {}),
      template("engineering", 90, { requiresConnectors: ["linear"] })
    ], base);
    expect(selected.templateId).toBe("general");
  });
});
