import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeVisibleTemplates, TemplateVisibilityStore } from "../src/template-visibility.js";
import type { DigestTemplate } from "../src/types.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function template(id: string, directory: string): DigestTemplate {
  return {
    directory,
    instructions: `Instructions for ${id}`,
    manifest: {
      version: 1, id, name: id, description: id, priority: 50,
      match: { triggers: ["manual"] },
      context: { connectors: ["notifications"], maximumItems: 20, maximumBytes: 20_000 },
      output: { sections: ["Summary"], maximumEntries: 5 }
    }
  };
}

describe("template visibility", () => {
  it("persists bounded hidden packaged-template IDs", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-template-state-"));
    roots.push(root);
    const state = new TemplateVisibilityStore(root);
    state.hide("general");
    expect(new TemplateVisibilityStore(root).hidden()).toEqual(new Set(["general"]));
    expect(JSON.parse(readFileSync(join(root, "template-state.json"), "utf8"))).toEqual({
      version: 1, hidden: ["general"]
    });
    state.show("general");
    expect(new TemplateVisibilityStore(root).hidden().size).toBe(0);
  });

  it("hides packaged defaults but lets a user overlay with the same ID remain visible", () => {
    const bundled = [template("focus-reentry", "/plugin/focus-reentry"), template("general", "/plugin/general")];
    const custom = template("custom", "/config/custom");
    expect(mergeVisibleTemplates(bundled, [custom], new Set(["general"])).map((item) => item.manifest.id))
      .toEqual(["custom", "focus-reentry"]);
    const overlay = template("general", "/config/general");
    expect(mergeVisibleTemplates(bundled, [overlay], new Set(["general"])).find((item) => item.manifest.id === "general")?.directory)
      .toBe("/config/general");
  });

  it("rejects invalid IDs instead of persisting them", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-template-state-"));
    roots.push(root);
    const state = new TemplateVisibilityStore(root);
    expect(() => state.hide("../general")).toThrow();
  });
});
