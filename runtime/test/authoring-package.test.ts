import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installAuthoringDirectory, validateAuthoringDirectory } from "../src/authoring-package.js";

const roots: string[] = [];
const skipSandboxTests = process.env.OMADIGEST_SKIP_SANDBOX_TESTS === "1";
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "omadigest-authoring-test-"));
  roots.push(root);
  const staging = join(root, "staging");
  mkdirSync(staging, { mode: 0o700 });
  writeFileSync(join(staging, "manifest.json"), JSON.stringify({
    schemaVersion: 1, id: "local.authoring-test", name: "Authoring test", version: "0.1.0",
    author: "OmaDigest", description: "A bounded authoring fixture", entryPoint: "connector.mjs",
    capabilities: ["sync"], setup: { summary: "No setup", fields: [], actionLabel: "Ready" },
    permissions: { networkHosts: [], commands: [], readPaths: [], writePaths: [] }
  }));
  writeFileSync(join(staging, "connector.mjs"), `
import { createInterface } from "node:readline";
const lines = createInterface({ input: process.stdin });
lines.on("line", line => {
  const request = JSON.parse(line);
  if (request.type === "probe") console.log(JSON.stringify({ version: 1, type: "status", id: request.id, state: "ready", message: "Ready" }));
  if (request.type === "shutdown") lines.close();
});
`);
  writeFileSync(join(staging, "connector.test.mjs"), `
import test from "node:test";
import assert from "node:assert/strict";
test("fixture", () => assert.equal(1, 1));
`);
  writeFileSync(join(staging, "README.md"), "# Authoring test\n");
  return staging;
}

describe("default-agent authoring packages", () => {
  it.skipIf(skipSandboxTests)("validates and atomically installs a package disabled", () => {
    const staging = fixture();
    const config = join(roots[0]!, "config");
    expect(validateAuthoringDirectory(staging).id).toBe("local.authoring-test");
    expect(installAuthoringDirectory(staging, config).id).toBe("local.authoring-test");
    expect(JSON.parse(readFileSync(join(config, "integration-state.json"), "utf8"))).toEqual({
      version: 2,
      sources: { "local.authoring-test": { enabled: false, categories: {} } }
    });
    expect(readFileSync(join(config, "integrations", "local.authoring-test", "README.md"), "utf8")).toContain("Authoring test");
  });

  it("rejects symbolic links before validation", () => {
    const staging = fixture();
    const target = join(staging, "README.md");
    rmSync(target);
    symlinkSync("manifest.json", target);
    expect(() => validateAuthoringDirectory(staging)).toThrow(/symbolic links/u);
  });
});
