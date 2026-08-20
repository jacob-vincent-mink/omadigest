import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { integrationManifestSchema, type IntegrationManifest } from "./integration-schema.js";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_STATE_BYTES = 1024 * 1024;

export type IntegrationSource = "bundled" | "user";
export type DiscoveredIntegration = {
  manifest: IntegrationManifest;
  directory: string;
  source: IntegrationSource;
  enabled: boolean;
};

type IntegrationState = { version: 1; enabled: string[] };

export function integrationConfigRoot(env: NodeJS.ProcessEnv = process.env): string {
  const xdg = env.XDG_CONFIG_HOME?.trim();
  if (xdg?.startsWith("/")) return join(xdg, "omadigest");
  const home = env.HOME?.trim();
  if (!home?.startsWith("/")) throw new Error("OmaDigest cannot resolve its configuration directory");
  return join(home, ".config", "omadigest");
}

export function discoverIntegrations(
  bundledRoot: string,
  userRoot: string,
  statePath: string
): DiscoveredIntegration[] {
  const state = readIntegrationState(statePath);
  const byId = new Map<string, Omit<DiscoveredIntegration, "enabled">>();
  for (const [root, source] of [[bundledRoot, "bundled"], [userRoot, "user"]] as const) {
    if (!existsSync(root)) continue;
    let entries;
    try { entries = readdirSync(root, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const loaded = loadIntegration(join(root, entry.name), source);
      if (loaded === undefined || byId.has(loaded.manifest.id)) continue;
      byId.set(loaded.manifest.id, loaded);
    }
  }
  return [...byId.values()]
    .map((integration) => ({ ...integration, enabled: state.enabled.includes(integration.manifest.id) }))
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

export function setIntegrationEnabled(statePath: string, id: string, enabled: boolean): void {
  const current = readIntegrationState(statePath);
  const ids = new Set(current.enabled);
  if (enabled) ids.add(id);
  else ids.delete(id);
  writeIntegrationState(statePath, { version: 1, enabled: [...ids].sort() });
}

export function readIntegrationState(path: string): IntegrationState {
  try {
    if (statSync(path).size > MAX_STATE_BYTES) return { version: 1, enabled: [] };
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.enabled)) return { version: 1, enabled: [] };
    const enabled = value.enabled.filter((id): id is string => typeof id === "string" && /^[a-z0-9][a-z0-9._-]{0,127}$/u.test(id));
    return { version: 1, enabled: [...new Set(enabled)].slice(0, 1000) };
  } catch { return { version: 1, enabled: [] }; }
}

function loadIntegration(directory: string, source: IntegrationSource): Omit<DiscoveredIntegration, "enabled"> | undefined {
  const manifestPath = join(directory, "manifest.json");
  try {
    if (lstatSync(manifestPath).isSymbolicLink() || statSync(manifestPath).size > MAX_MANIFEST_BYTES) return undefined;
    const manifest = integrationManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
    if (manifest.id !== directory.split(sep).at(-1)) return undefined;
    const entryPoint = resolve(directory, manifest.entryPoint);
    if (!entryPoint.startsWith(`${resolve(directory)}${sep}`)) return undefined;
    if (lstatSync(entryPoint).isSymbolicLink() || !statSync(entryPoint).isFile()) return undefined;
    return { manifest, directory, source };
  } catch { return undefined; }
}

function writeIntegrationState(path: string, state: IntegrationState): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
