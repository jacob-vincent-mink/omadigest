import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { discoverIntegrations, readIntegrationState, setIntegrationEnabled } from "../src/integrations.js";

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "omadigest-integrations-"));
  temporaryRoots.push(root);
  return root;
}

function createIntegration(root: string, id = "local.calendar"): void {
  const directory = join(root, id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "connector.mjs"), "process.stdin.resume();\n");
  writeFileSync(join(directory, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    id,
    name: "Calendar",
    version: "0.1.0",
    author: "Test",
    description: "Reads upcoming calendar events.",
    entryPoint: "connector.mjs",
    capabilities: ["sync", "resolve"],
    setup: {
      summary: "Connect a calendar account.",
      fields: [],
      actionLabel: "Connect"
    },
    permissions: {
      networkHosts: ["calendar.example.com"],
      commands: [],
      readPaths: [],
      writePaths: []
    }
  }));
}

describe("integrations", () => {
  it("discovers a valid disabled package", () => {
    const root = temporaryRoot();
    const bundled = join(root, "bundled");
    createIntegration(bundled);
    const integrations = discoverIntegrations(bundled, join(root, "user"), join(root, "state.json"));
    expect(integrations).toHaveLength(1);
    expect(integrations[0]).toMatchObject({ source: "bundled", enabled: false });
  });

  it("persists enablement separately from removable package code", () => {
    const root = temporaryRoot();
    const statePath = join(root, "config", "state.json");
    setIntegrationEnabled(statePath, "local.calendar", true);
    expect(readIntegrationState(statePath).enabled).toEqual(["local.calendar"]);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({ version: 1, enabled: ["local.calendar"] });
  });

  it("rejects an entry point symlink", () => {
    const root = temporaryRoot();
    const bundled = join(root, "bundled");
    createIntegration(bundled);
    rmSync(join(bundled, "local.calendar", "connector.mjs"));
    const target = join(root, "outside.mjs");
    writeFileSync(target, "");
    symlinkSync(target, join(bundled, "local.calendar", "connector.mjs"));
    expect(discoverIntegrations(bundled, join(root, "user"), join(root, "state.json"))).toEqual([]);
  });
});
