import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import type { DiscoveredIntegration } from "../src/integrations.js";
import { isPublicAddress, proxyConnectorHttps } from "../src/connector-network.js";
import {
  ConnectorCallError,
  IntegrationRuntime,
  enabledCategoriesForSync,
  filterConnectorItems,
  normalizeConnectorError,
  normalizeConnectorStatus
} from "../src/integration-runtime.js";

const roots: string[] = [];
const skipSandboxTests = process.env.OMADIGEST_SKIP_SANDBOX_TESTS === "1";
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

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
  it.skipIf(skipSandboxTests)("gives connector code neither direct network nor child-process authority", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-runtime-sandbox-"));
    roots.push(root);
    const directory = join(root, "integration");
    mkdirSync(directory);
    let localRequests = 0;
    const server = createServer((_request, response) => { localRequests += 1; response.end("reached"); });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Test server did not bind");
    writeFileSync(join(directory, "connector.mjs"), `
      import { execFileSync } from "node:child_process";
      import { readFileSync } from "node:fs";
      import { createInterface } from "node:readline";
      let childDenied = false;
      let filesystemDenied = false;
      let networkDenied = false;
      try { execFileSync("/usr/bin/id"); } catch (error) { childDenied = String(error?.code || error).includes("ACCESS_DENIED"); }
      try { readFileSync("/etc/passwd", "utf8"); } catch (error) { filesystemDenied = String(error?.code || error).includes("ACCESS_DENIED"); }
      try { await fetch("http://127.0.0.1:${address.port}/"); } catch { networkDenied = true; }
      const lines = createInterface({ input: process.stdin });
      for await (const line of lines) {
        const request = JSON.parse(line);
        if (request.type === "probe") console.log(JSON.stringify({
          version: 1, type: "status", id: request.id,
          state: childDenied && filesystemDenied && networkDenied ? "ready" : "error",
          message: childDenied + ":" + filesystemDenied + ":" + networkDenied
        }));
        if (request.type === "shutdown") break;
      }
    `);
    const source = integration();
    source.directory = directory;
    source.manifest.permissions.networkHosts = ["example.com"];
    try {
      const status = await new IntegrationRuntime(join(root, "config")).status(source);
      expect(status).toMatchObject({ state: "ready", message: "true:true:true" });
      expect(localRequests).toBe(0);
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it("rejects undeclared and private connector network destinations", async () => {
    const source = integration();
    source.manifest.permissions.networkHosts = ["example.com"];
    const request = { version: 1, type: "sync", id: "parent", config: {} };
    const network = { version: 1, type: "network_request", id: "parent", requestId: "network-1", method: "GET", headers: {} };
    await expect(proxyConnectorHttps(source, request, { ...network, url: "https://127.0.0.1/private" }))
      .rejects.toThrow(/undeclared network host/u);
    source.manifest.permissions.networkHosts = ["127.0.0.1"];
    await expect(proxyConnectorHttps(source, request, { ...network, url: "https://127.0.0.1/private" }))
      .rejects.toThrow(/private or non-routable/u);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("10.0.0.1")).toBe(false);
    expect(isPublicAddress("::1")).toBe(false);
  });

  it("projects tampered public config through the declared bounded schema", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-runtime-config-"));
    roots.push(root);
    const source = integration();
    source.manifest.setup.fields = [
      { key: "name", label: "Name", type: "string", description: "Display name", required: false },
      { key: "endpoint", label: "Endpoint", type: "url", description: "Service endpoint", required: false },
      { key: "enabled", label: "Enabled", type: "boolean", description: "Enable sync", required: false }
    ];
    const directory = join(root, "integration-config");
    mkdirSync(directory);
    const path = join(directory, "local.source.json");
    writeFileSync(path, JSON.stringify({
      version: 1,
      values: {
        name: "Kept",
        endpoint: "file:///etc/passwd",
        enabled: "yes",
        undeclared: "discard me"
      }
    }));
    const runtime = new IntegrationRuntime(root);
    await expect(runtime.config(source)).resolves.toEqual({ name: "Kept" });
    writeFileSync(path, "x".repeat(257 * 1024));
    await expect(runtime.config(source)).resolves.toEqual({});
  });

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
