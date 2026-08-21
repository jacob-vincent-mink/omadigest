import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AttentionItem, SourceStatus } from "./types.js";
import { DEFAULT_CATEGORY_ID, type DiscoveredIntegration } from "./integrations.js";

const MAX_CONNECTOR_RESPONSE_BYTES = 64 * 1024;
const boundedString = (maximumChars: number, maximumBytes: number) => z.string().max(maximumChars).refine(
  (value) => Buffer.byteLength(value, "utf8") <= maximumBytes,
  "Connector string is too large"
);

const connectorItemSchema = z.object({
  id: boundedString(240, 480).pipe(z.string().min(1)),
  connector: boundedString(128, 256).pipe(z.string().min(1)),
  category: boundedString(64, 128).optional(),
  kind: boundedString(100, 200).pipe(z.string().min(1)),
  occurredAt: z.string().datetime(),
  title: boundedString(2_000, 4_000),
  body: boundedString(8_000, 12_000).optional(),
  url: z.string().url().max(2_048).refine((value) => Buffer.byteLength(value, "utf8") <= 4_096, "Connector URL is too large").optional(),
  sensitivity: z.enum(["public", "personal", "work", "unknown"]),
  derivedFrom: z.array(boundedString(240, 480).pipe(z.string().min(1))).min(1).max(20)
}).strict();

export class ConnectorCallError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export class IntegrationRuntime {
  readonly #configRoot: string;

  constructor(configRoot: string) { this.#configRoot = configRoot; }

  async configure(integration: DiscoveredIntegration, values: Record<string, unknown>): Promise<SourceStatus> {
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
    return this.status(integration);
  }

  async status(integration: DiscoveredIntegration): Promise<SourceStatus> {
    try {
      const config = await this.config(integration);
      const response = await callConnector(integration, { version: 1, type: "probe", id: randomUUID(), config });
      return normalizeConnectorStatus(integration, response);
    } catch (error) {
      return normalizeConnectorError(integration, error);
    }
  }

  async sync(
    integrations: DiscoveredIntegration[],
    allowedConnectorIds: string[],
    requestedCategories: Record<string, string[]> | undefined,
    since: string,
    until: string
  ): Promise<AttentionItem[]> {
    const allowed = new Set(allowedConnectorIds.slice(0, 16));
    const results = await Promise.all(integrations.filter((item) =>
      item.enabled && allowed.has(item.manifest.id) && item.manifest.capabilities.includes("sync")).map(async (integration) => {
      try {
        const categories = enabledCategoriesForSync(integration, requestedCategories?.[integration.manifest.id]);
        if (categories.length === 0) return [];
        const config = await this.config(integration);
        const response = await callConnector(integration, {
          version: 1, type: "sync", id: randomUUID(), config, categories, since, until, limit: 50, cursor: null
        });
        if (response.type !== "items" || !Array.isArray(response.items)) return [];
        if (response.items.length > 100) return [];
        return filterConnectorItems(integration, categories, response.items);
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

  async clearSecrets(integrations: DiscoveredIntegration[]): Promise<void> {
    for (const integration of integrations.slice(0, 128)) {
      for (const field of integration.manifest.setup.fields.slice(0, 64)) {
        if (field.type !== "secret") continue;
        await clearIntegrationSecret(integration.manifest.id, field.key);
      }
    }
  }

  #publicConfigPath(id: string): string { return join(this.#configRoot, "integration-config", `${id}.json`); }
}

export function enabledCategoriesForSync(integration: DiscoveredIntegration, requested?: string[]): string[] {
  const enabled = integration.categories.filter((category) => category.enabled).map((category) => category.id);
  if (requested === undefined) return enabled;
  const requestedSet = new Set(requested.slice(0, 32));
  return enabled.filter((id) => requestedSet.has(id));
}

export function filterConnectorItems(
  integration: DiscoveredIntegration,
  categories: string[],
  rawItems: unknown[]
): AttentionItem[] {
  if (rawItems.length > 100) return [];
  const allowedCategories = new Set(categories.slice(0, 32));
  return rawItems.slice(0, 50).flatMap((raw): AttentionItem[] => {
    const parsed = connectorItemSchema.safeParse(raw);
    if (!parsed.success || parsed.data.connector !== integration.manifest.id) return [];
    const category = parsed.data.category ?? (integration.manifest.categories === undefined ? DEFAULT_CATEGORY_ID : undefined);
    if (category === undefined || !allowedCategories.has(category)) return [];
    return [{
      id: parsed.data.id,
      source: integration.manifest.id,
      app: integration.manifest.name,
      category,
      title: parsed.data.title,
      body: parsed.data.body || "",
      urgency: "normal",
      occurredAt: parsed.data.occurredAt
    }];
  });
}

export function normalizeConnectorStatus(
  integration: DiscoveredIntegration,
  response: Record<string, unknown>,
  checkedAt = new Date().toISOString()
): SourceStatus {
  if (response.type !== "status")
    return statusWithAction(integration, { state: "error", code: "invalid_response", message: "The source returned an invalid status.", checkedAt });
  const state = normalizeStatusState(response.state);
  if (state === undefined)
    return statusWithAction(integration, { state: "error", code: "invalid_status", message: "The source returned an invalid status.", checkedAt });
  const message = boundEvidence(response.message, state === "ready" ? "Ready" : statusFallback(state));
  const code = validErrorCode(response.code) ? response.code : undefined;
  return statusWithAction(integration, { state, message, checkedAt, ...(code === undefined ? {} : { code }) });
}

export function normalizeConnectorError(
  integration: DiscoveredIntegration,
  error: unknown,
  checkedAt = new Date().toISOString()
): SourceStatus {
  const candidateCode = error instanceof ConnectorCallError ? error.code : "connector_failed";
  const code = validErrorCode(candidateCode) ? candidateCode : "connector_failed";
  const state = code === "authentication_required" || code === "authentication-required"
    ? "authentication-required"
    : code === "setup_required" || code === "setup-required" ? "setup-required" : "error";
  const message = boundEvidence(error instanceof Error ? error.message : undefined, statusFallback(state));
  return statusWithAction(integration, { state, message, checkedAt, code });
}

function normalizeStatusState(value: unknown): SourceStatus["state"] | undefined {
  if (value === "ready" || value === "error") return value;
  if (value === "authentication-required" || value === "authentication_required") return "authentication-required";
  if (value === "setup-required" || value === "setup_required") return "setup-required";
  return undefined;
}

function statusWithAction(integration: DiscoveredIntegration, status: SourceStatus): SourceStatus {
  if ((status.state === "authentication-required" || status.state === "setup-required")
    && integration.manifest.setup.fields.length > 0) {
    return { ...status, action: { kind: "setup", label: integration.manifest.setup.actionLabel } };
  }
  return status;
}

function statusFallback(state: SourceStatus["state"]): string {
  if (state === "authentication-required") return "Authentication required";
  if (state === "setup-required") return "Setup required";
  if (state === "ready") return "Ready";
  return "The source could not be checked.";
}

function validErrorCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_-]{0,79}$/u.test(value);
}

function boundEvidence(value: unknown, fallback: string): string {
  const source = typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  let result = "";
  for (const character of source) {
    if (Buffer.byteLength(result + character, "utf8") > 1_000) break;
    result += character;
  }
  return result;
}

async function callConnector(integration: DiscoveredIntegration, request: Record<string, unknown>): Promise<Record<string, any>> {
  const commandEnvironment = await connectorCommandEnvironment(integration);
  const hasNetworkPermission = integration.manifest.permissions.networkHosts.length > 0
    || (integration.manifest.permissions.networkSetupFields ?? []).length > 0;
  return new Promise((resolveCall, rejectCall) => {
    const args = [
      "--die-with-parent", "--unshare-all",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/etc", "/etc",
      "--ro-bind", integration.directory, "/integration",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--dir", "/commands",
      "--setenv", "HOME", "/nonexistent",
      "--setenv", "PATH", "/commands"
    ];
    for (const command of integration.manifest.permissions.commands) {
      const executable = allowedConnectorCommand(command);
      if (executable === undefined) { rejectCall(new Error(`Unsupported connector command: ${command}`)); return; }
      args.push("--ro-bind", executable, `/commands/${command}`);
    }
    for (const [key, value] of Object.entries(commandEnvironment)) args.push("--setenv", key, value);
    if (hasNetworkPermission) {
      args.push("--share-net");
      if (existsSync("/run/systemd/resolve"))
        args.push("--dir", "/run", "--ro-bind", "/run/systemd/resolve", "/run/systemd/resolve");
    }
    args.push("/usr/bin/node", "--permission", "--allow-fs-read=/integration");
    if (hasNetworkPermission) args.push("--allow-net");
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
        if (Buffer.byteLength(line, "utf8") > MAX_CONNECTOR_RESPONSE_BYTES) {
          rejectCall(new ConnectorCallError("response_too_large", "Integration response exceeded the byte limit"));
          return;
        }
        const response = JSON.parse(line) as Record<string, any>;
        if (response.type === "error") {
          const code = validErrorCode(response.code) ? response.code : "connector_failed";
          rejectCall(new ConnectorCallError(code, boundEvidence(response.message, "Integration failed")));
        }
        else resolveCall(response);
      } catch { rejectCall(new Error("Integration returned an invalid response")); }
    });
    child.stdin.end(`${JSON.stringify(request)}\n${JSON.stringify({ version: 1, type: "shutdown", id: randomUUID() })}\n`);
  });
}

function allowedConnectorCommand(command: string): string | undefined {
  return command === "gh" ? "/usr/bin/gh" : undefined;
}

async function connectorCommandEnvironment(integration: DiscoveredIntegration): Promise<Record<string, string>> {
  if (!integration.manifest.permissions.commands.includes("gh")) return {};
  const token = await executeForSecret("/usr/bin/gh", ["auth", "token"]);
  if (token === "") throw new Error("GitHub CLI is not authenticated");
  return { GH_TOKEN: token, GH_PAGER: "cat", GH_PROMPT_DISABLED: "1" };
}

function executeForSecret(file: string, args: string[]): Promise<string> {
  return new Promise((resolveSecret, rejectSecret) => {
    execFile(file, args, { encoding: "utf8", timeout: 10_000, maxBuffer: 64 * 1024 }, (error, stdout) => {
      if (error !== null) rejectSecret(new Error("GitHub CLI authentication is unavailable"));
      else resolveSecret(stdout.trim());
    });
  });
}

function storeIntegrationSecret(integrationId: string, key: string, secret: string): Promise<void> {
  return secretTool(["store", "--label=OmaDigest integration", "application", "omadigest", "integration", integrationId, "field", key], secret).then(() => undefined);
}
function lookupIntegrationSecret(integrationId: string, key: string): Promise<string | undefined> {
  return secretTool(["lookup", "application", "omadigest", "integration", integrationId, "field", key]);
}
function clearIntegrationSecret(integrationId: string, key: string): Promise<string | undefined> {
  return secretTool(["clear", "application", "omadigest", "integration", integrationId, "field", key]);
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
