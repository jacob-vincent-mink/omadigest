import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearUserIntegrations, clearUserTemplates } from "../src/data-management.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function configRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "omadigest-data-"));
  roots.push(root);
  return root;
}

describe("OmaDigest data management", () => {
  it("removes only user template storage", () => {
    const root = configRoot();
    mkdirSync(join(root, "templates", "custom"), { recursive: true });
    writeFileSync(join(root, "templates", "custom", "SKILL.md"), "custom");
    writeFileSync(join(root, "template-state.json"), "{}\n");
    writeFileSync(join(root, "privacy.json"), "{}\n");
    clearUserTemplates(root);
    expect(existsSync(join(root, "templates"))).toBe(false);
    expect(existsSync(join(root, "template-state.json"))).toBe(false);
    expect(existsSync(join(root, "privacy.json"))).toBe(true);
  });

  it("removes user integrations, setup, and enablement without touching other config", () => {
    const root = configRoot();
    mkdirSync(join(root, "integrations", "custom"), { recursive: true });
    mkdirSync(join(root, "integration-config"), { recursive: true });
    writeFileSync(join(root, "integration-config", "custom.json"), "{}\n");
    writeFileSync(join(root, "integration-state.json"), "{}\n");
    writeFileSync(join(root, "privacy.json"), "{}\n");
    clearUserIntegrations(root);
    expect(existsSync(join(root, "integrations"))).toBe(false);
    expect(existsSync(join(root, "integration-config"))).toBe(false);
    expect(existsSync(join(root, "integration-state.json"))).toBe(false);
    expect(existsSync(join(root, "privacy.json"))).toBe(true);
  });
});
