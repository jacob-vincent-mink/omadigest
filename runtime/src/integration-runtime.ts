import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AttentionItem } from "./types.js";
import type { DiscoveredIntegration } from "./integrations.js";

const connectorItemSchema = z.object({
  id: z.string().min(1).max(240),
  connector: z.string().min(1).max(128),
  kind: z.string().min(1).max(100),
  occurredAt: z.string().datetime(),
  title: z.string().max(2_000),
  body: z.string().max(8_000).optional(),
  url: z.string().url().max(2_048).optional(),
  sensitivity: z.enum(["public", "personal", "work", "unknown"]),
  derivedFrom: z.array(z.string().min(1).max(240)).min(1).max(20)
}).strict();

export class IntegrationRuntime {
  readonly #configRoot: string;

  constructor(configRoot: string) { this.#configRoot = configRoot; }

  async configure(integration: DiscoveredIntegration, values: Record<string, unknown>): Promise<void> {
    const allowed = new Set(integration.manifest.setup.fields.map((field) => field.key));
    if (Object.keys(values).some((key) => !allowed.has(key))) throw new Error("Setup contains an unknown field");
    const publicValues: Record<string, string | boolean> = {};
    for (const field of integration.manifest.setup.fields) {
      const raw = values[field.key];
      if (field.type === "boolean") {
        if (typeof raw !== "boolean") throw new Error(`${field.label} must be on or off`);
        publicValues[field.key] = raw;
        continue;
      }
      const value = typeof raw === "string" ? raw.trim() : "";
      if (field.required && value === "") throw new Error(`${field.label} is required`);
      if (value.length > 20_000) throw new Error(`${field.label} is too long`);
      if (field.type === "url" && value !== "") validateSetupUrl(value);
      if (field.type === "secret") {
        if (value !== "") await storeIntegrationSecret(integration.manifest.id, field.key, value);
      } else publicValues[field.key] = value;
    }
    const path = this.#publicConfigPath(integration.manifest.id);
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, values: publicValues }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, path);
    const config = await this.config(integration);
    const response = await callConnector(integration, { version: 1, type: "probe", id: randomUUID(), config });
    if (response.type !== "status" || response.state !== "ready") throw new Error(response.message || "Integration setup did not become ready");
  }

  async status(integration: DiscoveredIntegration): Promise<{ ready: boolean; message: string }> {
    try {
      const config = await this.config(integration);
      const response = await callConnector(integration, { version: 1, type: "probe", id: randomUUID(), config });
      return { ready: response.type === "status" && response.state === "ready", message: String(response.message || "") };
    } catch (error) {
      return { ready: false, message: error instanceof Error ? error.message : "Setup required" };
    }
  }

  async sync(integrations: DiscoveredIntegration[], since: string, until: string): Promise<AttentionItem[]> {
    const results = await Promise.all(integrations.filter((item) => item.enabled && item.manifest.capabilities.includes("sync")).map(async (integration) => {
      try {
        const config = await this.config(integration);
        const response = await callConnector(integration, {
          version: 1, type: "sync", id: randomUUID(), config, since, until, limit: 50, cursor: null
        });
        if (response.type !== "items" || !Array.isArray(response.items)) return [];
        return z.array(connectorItemSchema).max(100).parse(response.items).map((item): AttentionItem => ({
          id: item.id,
          source: integration.manifest.id,
          app: integration.manifest.name,
          title: item.title,
          body: item.body || "",
          urgency: "normal",
          occurredAt: item.occurredAt
        }));
      } catch { return []; }
    }));
    return results.flat().slice(0, 200);
  }

  async config(integration: DiscoveredIntegration): Promise<Record<string, string | boolean>> {
    let publicValues: Record<string, string | boolean> = {};
    try {
      const raw: unknown = JSON.parse(readFileSync(this.#publicConfigPath(integration.manifest.id), "utf8"));
      if (isObject(raw) && raw.version === 1 && isObject(raw.values)) {
        publicValues = Object.fromEntries(Object.entries(raw.values).filter((entry): entry is [string, string | boolean] =>
          typeof entry[1] === "string" || typeof entry[1] === "boolean"));
      }
    } catch { /* No public setup yet. */ }
    for (const field of integration.manifest.setup.fields) {
      if (field.type !== "secret") continue;
      const secret = await lookupIntegrationSecret(integration.manifest.id, field.key);
      if (secret !== undefined) publicValues[field.key] = secret;
    }
    return publicValues;
  }

  #publicConfigPath(id: string): string { return join(this.#configRoot, "integration-config", `${id}.json`); }
}

function callConnector(integration: DiscoveredIntegration, request: Record<string, unknown>): Promise<Record<string, any>> {
  return new Promise((resolveCall, rejectCall) => {
    const args = [
      "--die-with-parent", "--unshare-all",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/etc", "/etc",
      "--ro-bind", integration.directory, "/integration",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
      "--setenv", "HOME", "/nonexistent",
      "--setenv", "PATH", "/usr/bin:/bin"
    ];
    if (integration.manifest.permissions.networkHosts.length > 0) args.push("--share-net");
    args.push("/usr/bin/node", "--permission", "--allow-fs-read=/integration");
    if (integration.manifest.permissions.networkHosts.length > 0) args.push("--allow-net");
    if (integration.manifest.permissions.commands.length > 0) args.push("--allow-child-process");
    args.push(`/integration/${integration.manifest.entryPoint}`);
    const child = spawn("bwrap", args, {
      cwd: "/",
      env: { PATH: process.env.PATH || "/usr/bin", HOME: "/nonexistent", LANG: process.env.LANG || "C.UTF-8" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); rejectCall(new Error("Integration timed out")); }, 20_000);
    timer.unref();
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = (stdout + String(chunk)).slice(-128 * 1024); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-4 * 1024); });
    child.once("error", (error) => { clearTimeout(timer); rejectCall(error); });
    child.once("exit", () => {
      clearTimeout(timer);
      const line = stdout.split("\n").find((value) => value.trim() !== "");
      if (line === undefined) { rejectCall(new Error(stderr.trim() || "Integration returned no response")); return; }
      try {
        const response = JSON.parse(line) as Record<string, any>;
        if (response.type === "error") rejectCall(new Error(String(response.message || "Integration failed")));
        else resolveCall(response);
      } catch { rejectCall(new Error("Integration returned an invalid response")); }
    });
    child.stdin.end(`${JSON.stringify(request)}\n${JSON.stringify({ version: 1, type: "shutdown", id: randomUUID() })}\n`);
  });
}

function storeIntegrationSecret(integrationId: string, key: string, secret: string): Promise<void> {
  return secretTool(["store", "--label=OmaDigest integration", "application", "omadigest", "integration", integrationId, "field", key], secret).then(() => undefined);
}
function lookupIntegrationSecret(integrationId: string, key: string): Promise<string | undefined> {
  return secretTool(["lookup", "application", "omadigest", "integration", integrationId, "field", key]);
}
function secretTool(args: string[], input?: string): Promise<string | undefined> {
  return new Promise((resolveSecret, rejectSecret) => {
    const child = spawn("secret-tool", args, { stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout = (stdout + String(chunk)).slice(-32 * 1024); });
    if (input === undefined) child.stdin.end(); else child.stdin.end(`${input}\n`);
    child.once("error", rejectSecret);
    child.once("exit", (code) => code === 0 ? resolveSecret(stdout.trim() || undefined) : input === undefined ? resolveSecret(undefined) : rejectSecret(new Error("Credential storage failed")));
  });
}
function validateSetupUrl(raw: string): void {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Setup URLs must use credential-free HTTPS");
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
