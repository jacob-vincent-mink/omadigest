import { describe, expect, it } from "vitest";
import { validateIntegrationPackageFiles } from "../src/integration-package-validation.js";

const skipSandboxTests = process.env.OMADIGEST_SKIP_SANDBOX_TESTS === "1";

const validConnector = `
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export function status() {
  return { type: "status", state: "ready", message: "Ready" };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    const request = JSON.parse(line);
    if (request.type === "probe") console.log(JSON.stringify({ version: 1, type: "status", id: request.id, ...status() }));
    if (request.type === "shutdown") lines.close();
  });
}
`;

const validTest = `
import test from "node:test";
import assert from "node:assert/strict";
import { status } from "./connector.mjs";

test("reports ready", () => {
  assert.equal(status().state, "ready");
});
`;

describe("integration package validation", () => {
  const packageFiles = (connector: string) => [
    { path: "manifest.json", content: JSON.stringify({
      schemaVersion: 1,
      id: "local.validation",
      name: "Validation",
      version: "0.1.0",
      author: "OmaDigest",
      description: "Validation fixture",
      entryPoint: "connector.mjs",
      capabilities: ["sync"],
      setup: { summary: "No setup", fields: [], actionLabel: "Ready" },
      permissions: { networkHosts: [], commands: [], readPaths: [], writePaths: [] }
    }) },
    { path: "connector.mjs", content: connector },
    { path: "connector.test.mjs", content: validTest },
    { path: "README.md", content: "# Validation" }
  ];

  it.skipIf(skipSandboxTests)("syntax-checks and runs a valid package test in the sandbox", () => {
    expect(() => validateIntegrationPackageFiles(packageFiles(validConnector))).not.toThrow();
  });

  it("returns a useful syntax error before a draft can be accepted", () => {
    expect(() => validateIntegrationPackageFiles(packageFiles("export const broken = ;")))
      .toThrow(/connector\.mjs syntax failed.*SyntaxError/su);
  });
});
