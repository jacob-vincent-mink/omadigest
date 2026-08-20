import { describe, expect, it } from "vitest";
import type { DiscoveredIntegration } from "../src/integrations.js";
import {
  ConnectorCallError,
  enabledCategoriesForSync,
  filterConnectorItems,
  normalizeConnectorError,
  normalizeConnectorStatus
} from "../src/integration-runtime.js";

function integration(withSetup = false): DiscoveredIntegration {
  return {
    directory: "/integration",
    source: "user",
    enabled: true,
    categories: [
      { id: "mentions", label: "Mentions", description: "Direct mentions", defaultEnabled: true, enabled: true },
      { id: "routine", label: "Routine", description: "Routine updates", defaultEnabled: true, enabled: false }
    ],
    manifest: {
      schemaVersion: 1,
      id: "local.source",
      name: "Source",
      version: "1.0.0",
      author: "Test",
      description: "A test source",
      entryPoint: "connector.mjs",
      capabilities: ["sync"],
      categories: [
        { id: "mentions", label: "Mentions", description: "Direct mentions", defaultEnabled: true },
        { id: "routine", label: "Routine", description: "Routine updates", defaultEnabled: true }
      ],
      setup: {
        summary: "Configure source",
        fields: withSetup ? [{ key: "token", label: "Token", type: "secret", description: "Access token", required: true }] : [],
        actionLabel: "Connect source"
      },
      permissions: { networkHosts: [], commands: [], readPaths: [], writePaths: [] }
    }
  };
}

const item = (id: string, category?: string) => ({
  id,
  connector: "local.source",
  ...(category === undefined ? {} : { category }),
  kind: "notification",
  occurredAt: "2026-08-20T12:00:00.000Z",
  title: `Item ${id}`,
  body: "Untrusted source text",
  sensitivity: "work",
  derivedFrom: [`source:${id}`]
});

describe("integration runtime source contract", () => {
  it("deterministically intersects template requests with user-enabled categories", () => {
    const source = integration();
    expect(enabledCategoriesForSync(source)).toEqual(["mentions"]);
    expect(enabledCategoriesForSync(source, ["routine", "mentions", "undeclared"])).toEqual(["mentions"]);
    expect(enabledCategoriesForSync(source, ["routine"])).toEqual([]);
  });

  it("discards disabled, undeclared, and missing categories before persistence", () => {
    const source = integration();
    const filtered = filterConnectorItems(source, ["mentions"], [
      item("kept", "mentions"), item("disabled", "routine"), item("undeclared", "private"), item("missing")
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ id: "kept", category: "mentions", source: "local.source" });
  });

  it("maps legacy category-less connector items to the implicit default category", () => {
    const source = integration();
    delete source.manifest.categories;
    source.categories = [{ id: "default", label: "All items", description: "All items provided by this source.", defaultEnabled: true, enabled: true }];
    expect(filterConnectorItems(source, ["default"], [item("legacy")])[0]?.category).toBe("default");
  });

  it("preserves connector error codes and maps status states", () => {
    const source = integration(true);
    const checkedAt = "2026-08-20T12:00:00.000Z";
    expect(normalizeConnectorError(source, new ConnectorCallError("authentication_required", "Reconnect"), checkedAt)).toEqual({
      state: "authentication-required",
      message: "Reconnect",
      checkedAt,
      code: "authentication_required",
      action: { kind: "setup", label: "Connect source" }
    });
    expect(normalizeConnectorStatus(source, { type: "status", state: "setup_required", message: "Finish setup", code: "missing_token" }, checkedAt)).toMatchObject({
      state: "setup-required", code: "missing_token", checkedAt
    });
    expect(normalizeConnectorError(integration(false), new ConnectorCallError("authentication_required", "Reconnect"), checkedAt).action).toBeUndefined();
  });

  it("bounds untrusted status messages by UTF-8 bytes", () => {
    const status = normalizeConnectorError(integration(), new ConnectorCallError("source_unavailable", "😀".repeat(1_000)));
    expect(Buffer.byteLength(status.message ?? "", "utf8")).toBeLessThanOrEqual(1_000);
    expect(status).toMatchObject({ state: "error", code: "source_unavailable" });
  });

  it("bounds connector item count and string bytes", () => {
    const source = integration();
    expect(filterConnectorItems(source, ["mentions"], Array.from({ length: 101 }, (_, index) => item(String(index), "mentions")))).toEqual([]);
    expect(filterConnectorItems(source, ["mentions"], [
      { ...item("large", "mentions"), title: "😀".repeat(1_100) }
    ])).toEqual([]);
  });
});
