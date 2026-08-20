import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installTemplateEdit } from "../src/drafts.js";
import { loadTemplates } from "../src/templates.js";
import { compiledTemplateSchema } from "../src/template-schema.js";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function policy(id = "edited-template"): string {
  return JSON.stringify({
    version: 1, id, name: "Edited template", description: "A user-edited briefing",
    priority: 60, match: { triggers: ["manual"] },
    context: { connectors: ["notifications"], maximumItems: 30, maximumBytes: 30_000 },
    output: { sections: ["Needs action", "No action"], maximumEntries: 8 }
  });
}

describe("manual template editing", () => {
  it("validates and atomically creates a user overlay", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-template-edit-"));
    roots.push(root);
    installTemplateEdit(root, "edited-template", "Cite every factual entry.\n", policy());
    expect(loadTemplates(join(root, "templates"))[0]).toMatchObject({
      manifest: { id: "edited-template", priority: 60 },
      instructions: "Cite every factual entry."
    });
  });

  it("refuses ID changes and invalid policy JSON", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-template-edit-"));
    roots.push(root);
    expect(() => installTemplateEdit(root, "edited-template", "Safe instructions", policy("different-template")))
      .toThrow(/ID cannot change/u);
    expect(() => installTemplateEdit(root, "edited-template", "Safe instructions", "{"))
      .toThrow();
  });

  it("accepts bounded connector categories and rejects nondeterministic references", () => {
    const parsed = JSON.parse(policy()) as Record<string, any>;
    parsed.context.connectors.push("local.source");
    parsed.context.connectorCategories = { "local.source": ["mentions", "routine"] };
    expect(compiledTemplateSchema.parse(parsed).context.connectorCategories).toEqual({
      "local.source": ["mentions", "routine"]
    });

    parsed.context.connectorCategories = { "other.source": ["mentions"] };
    expect(() => compiledTemplateSchema.parse(parsed)).toThrow(/undeclared connector/u);
    parsed.context.connectorCategories = { "local.source": Array.from({ length: 33 }, (_, index) => `category-${index}`) };
    expect(() => compiledTemplateSchema.parse(parsed)).toThrow();
  });
});
