import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { discoverIntegrations, readIntegrationState, setIntegrationCategoryEnabled, setIntegrationEnabled } from "../src/integrations.js";
import { integrationManifestSchema } from "../src/integration-schema.js";

const temporaryRoots: string[] = [];
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "omadigest-integrations-"));
  temporaryRoots.push(root);
  return root;
}

function createIntegration(root: string, id = "local.calendar", categories?: unknown[]): void {
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
    ...(categories === undefined ? {} : { categories }),
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
  it("allows dynamic network access only through declared URL setup fields", () => {
    const manifest = {
      schemaVersion: 1, id: "local.feed", name: "Feed", version: "1.0.0", author: "Test",
      description: "Reads one configured public feed.", entryPoint: "connector.mjs", capabilities: ["sync"],
      setup: {
        summary: "Connect a feed.", actionLabel: "Connect",
        fields: [{ key: "feed_url", label: "Feed URL", type: "url", description: "Public HTTPS feed.", required: true }]
      },
      permissions: { networkHosts: [], networkSetupFields: ["feed_url"], commands: [], readPaths: [], writePaths: [] }
    };
    expect(integrationManifestSchema.safeParse(manifest).success).toBe(true);
    expect(integrationManifestSchema.safeParse({
      ...manifest,
      setup: { ...manifest.setup, fields: [{ ...manifest.setup.fields[0], type: "secret" }] }
    }).success).toBe(false);
  });

  it("discovers a valid disabled package", () => {
    const root = temporaryRoot();
    const bundled = join(root, "bundled");
    createIntegration(bundled);
    const integrations = discoverIntegrations(bundled, join(root, "user"), join(root, "state.json"));
    expect(integrations).toHaveLength(1);
    expect(integrations[0]).toMatchObject({ source: "bundled", enabled: false });
    expect(integrations[0]?.categories).toEqual([{
      id: "default", label: "All items", description: "All items provided by this source.",
      enabled: true, defaultEnabled: true
    }]);
  });

  it("migrates v1 enablement and preserves it when writing v2 state", () => {
    const root = temporaryRoot();
    const statePath = join(root, "config", "state.json");
    mkdirSync(join(root, "config"), { recursive: true });
    writeFileSync(statePath, JSON.stringify({ version: 1, enabled: ["local.calendar", "bad id", "local.calendar"] }));
    expect(readIntegrationState(statePath)).toEqual({
      version: 2,
      sources: { "local.calendar": { enabled: true, categories: {} } }
    });
    setIntegrationCategoryEnabled(statePath, "local.calendar", "events", false);
    setIntegrationEnabled(statePath, "local.calendar", true);
    expect(JSON.parse(readFileSync(statePath, "utf8"))).toEqual({
      version: 2,
      sources: { "local.calendar": { enabled: true, categories: { events: false } } }
    });
  });

  it("applies category defaults and bounded user overrides", () => {
    const root = temporaryRoot();
    const bundled = join(root, "bundled");
    const statePath = join(root, "state.json");
    createIntegration(bundled, "local.calendar", [
      { id: "events", label: "Events", description: "Calendar events", defaultEnabled: true },
      { id: "reminders", label: "Reminders", description: "Calendar reminders", defaultEnabled: false }
    ]);
    setIntegrationCategoryEnabled(statePath, "local.calendar", "events", false);
    setIntegrationCategoryEnabled(statePath, "local.calendar", "reminders", true);
    expect(discoverIntegrations(bundled, join(root, "user"), statePath)[0]?.categories).toEqual([
      { id: "events", label: "Events", description: "Calendar events", defaultEnabled: true, enabled: false },
      { id: "reminders", label: "Reminders", description: "Calendar reminders", defaultEnabled: false, enabled: true }
    ]);
  });

  it("rejects duplicate, oversized, and excessive category declarations", () => {
    const invalidCases = [
      [
        { id: "events", label: "Events", description: "One", defaultEnabled: true },
        { id: "events", label: "Events again", description: "Two", defaultEnabled: true }
      ],
      [{ id: "events", label: "😀".repeat(50), description: "Too many bytes", defaultEnabled: true }],
      Array.from({ length: 33 }, (_, index) => ({ id: `category-${index}`, label: "Category", description: "Description", defaultEnabled: true }))
    ];
    for (const [index, categories] of invalidCases.entries()) {
      const root = temporaryRoot();
      const bundled = join(root, "bundled");
      createIntegration(bundled, `local.invalid-${index}`, categories);
      expect(discoverIntegrations(bundled, join(root, "user"), join(root, "state.json"))).toEqual([]);
    }
  });

  it("bounds persisted source and category identifiers", () => {
    const root = temporaryRoot();
    const statePath = join(root, "state.json");
    expect(() => setIntegrationEnabled(statePath, "bad source", true)).toThrow(/source ID/u);
    for (let index = 0; index < 64; index += 1)
      setIntegrationCategoryEnabled(statePath, "local.calendar", `category-${index}`, true);
    expect(() => setIntegrationCategoryEnabled(statePath, "local.calendar", "one-too-many", true)).toThrow(/Too many category overrides/u);
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
