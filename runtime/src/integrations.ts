import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { integrationCategoryIdSchema, integrationManifestSchema, type IntegrationManifest } from "./integration-schema.js";
import type { PublicSourceCategory } from "./types.js";

const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_STATE_BYTES = 256 * 1024;
const MAX_INTEGRATIONS = 256;
const MAX_CATEGORY_OVERRIDES = 64;
export const DEFAULT_CATEGORY_ID = "default";

export type IntegrationSource = "bundled" | "user";
export type DiscoveredIntegration = {
  manifest: IntegrationManifest;
  directory: string;
  source: IntegrationSource;
  enabled: boolean;
  categories: PublicSourceCategory[];
};

type SourceUserState = { enabled: boolean; categories: Record<string, boolean> };
export type IntegrationState = { version: 2; sources: Record<string, SourceUserState> };

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
  const byId = new Map<string, Omit<DiscoveredIntegration, "enabled" | "categories">>();
  for (const [root, source] of [[bundledRoot, "bundled"], [userRoot, "user"]] as const) {
    if (!existsSync(root)) continue;
    let entries;
    try { entries = readdirSync(root, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries.slice(0, MAX_INTEGRATIONS)) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const loaded = loadIntegration(join(root, entry.name), source);
      if (loaded === undefined || byId.has(loaded.manifest.id)) continue;
      byId.set(loaded.manifest.id, loaded);
    }
  }
  return [...byId.values()]
    .slice(0, MAX_INTEGRATIONS)
    .map((integration) => {
      const userState = state.sources[integration.manifest.id];
      return {
        ...integration,
        enabled: userState?.enabled ?? false,
        categories: publicCategories(integration.manifest, userState?.categories)
      };
    })
    .sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

export function setIntegrationEnabled(statePath: string, id: string, enabled: boolean): void {
  if (!validIntegrationId(id)) throw new Error("Invalid source ID");
  const current = readIntegrationState(statePath);
  const existing = current.sources[id] ?? { enabled: false, categories: {} };
  current.sources[id] = { ...existing, enabled };
  writeIntegrationState(statePath, current);
}

export function setIntegrationCategoryEnabled(statePath: string, id: string, categoryId: string, enabled: boolean): void {
  if (!validIntegrationId(id)) throw new Error("Invalid source ID");
  const current = readIntegrationState(statePath);
  const existing = current.sources[id] ?? { enabled: false, categories: {} };
  const categories = { ...existing.categories, [integrationCategoryIdSchema.parse(categoryId)]: enabled };
  if (Object.keys(categories).length > MAX_CATEGORY_OVERRIDES) throw new Error("Too many category overrides for this source");
  current.sources[id] = { enabled: existing.enabled, categories };
  writeIntegrationState(statePath, current);
}

export function readIntegrationState(path: string): IntegrationState {
  try {
    if (statSync(path).size > MAX_STATE_BYTES) return emptyState();
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isObject(value)) return emptyState();
    if (value.version === 1 && Array.isArray(value.enabled)) return migrateVersionOne(value.enabled);
    if (value.version !== 2 || !isObject(value.sources)) return emptyState();
    const sources: Record<string, SourceUserState> = {};
    for (const [id, raw] of Object.entries(value.sources).slice(0, MAX_INTEGRATIONS)) {
      if (!validIntegrationId(id) || !isObject(raw) || typeof raw.enabled !== "boolean" || !isObject(raw.categories)) continue;
      const categories: Record<string, boolean> = {};
      for (const [categoryId, enabled] of Object.entries(raw.categories).slice(0, MAX_CATEGORY_OVERRIDES)) {
        if (integrationCategoryIdSchema.safeParse(categoryId).success && typeof enabled === "boolean") categories[categoryId] = enabled;
      }
      sources[id] = { enabled: raw.enabled, categories };
    }
    return { version: 2, sources };
  } catch { return emptyState(); }
}

export function publicCategories(manifest: IntegrationManifest, overrides: Record<string, boolean> = {}): PublicSourceCategory[] {
  const declared = manifest.categories ?? [{
    id: DEFAULT_CATEGORY_ID,
    label: "All items",
    description: "All items provided by this source.",
    defaultEnabled: true
  }];
  return declared.map((category) => ({
    ...category,
    enabled: overrides[category.id] ?? category.defaultEnabled
  }));
}

function loadIntegration(directory: string, source: IntegrationSource): Omit<DiscoveredIntegration, "enabled" | "categories"> | undefined {
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
  if (Object.keys(state.sources).length > MAX_INTEGRATIONS) throw new Error("Too many source settings");
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) throw new Error("Source settings are too large");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, serialized, { mode: 0o600 });
  renameSync(temporary, path);
}

function migrateVersionOne(enabled: unknown[]): IntegrationState {
  const sources: Record<string, SourceUserState> = {};
  for (const id of enabled.slice(0, MAX_INTEGRATIONS)) {
    if (typeof id === "string" && validIntegrationId(id)) sources[id] = { enabled: true, categories: {} };
  }
  return { version: 2, sources };
}

function emptyState(): IntegrationState { return { version: 2, sources: {} }; }
function validIntegrationId(id: string): boolean { return /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/u.test(id); }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
