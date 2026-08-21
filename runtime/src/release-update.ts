import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ReleaseUpdateStatus } from "./types.js";

const REPOSITORY = "jacob-vincent-mink/omadigest";
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPOSITORY}/releases/latest`;
const RELEASE_BASE = `https://github.com/${REPOSITORY}/releases/tag/`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const MAX_STATE_BYTES = 64 * 1_024;
const MAX_RESPONSE_BYTES = 64 * 1_024;
const REQUEST_TIMEOUT_MS = 5_000;

const versionSchema = z.string().regex(/^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/).max(80);
const cacheSchema = z.object({
  version: z.literal(1),
  checkedAt: z.string().datetime(),
  latestVersion: versionSchema,
  releaseUrl: z.string().url().max(512),
  etag: z.string().regex(/^[\x20-\x7e]{1,512}$/).optional(),
  dismissedVersion: versionSchema.optional()
}).strict();
type UpdateCache = z.infer<typeof cacheSchema>;

type Dependencies = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  statePath?: string;
};

export class ReleaseUpdateService {
  readonly #currentVersion: string;
  readonly #path: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #now: () => Date;
  #cache: UpdateCache | undefined;

  constructor(currentVersion: string, dependencies: Dependencies = {}) {
    this.#currentVersion = normalizeVersion(versionSchema.parse(currentVersion));
    const env = dependencies.env ?? process.env;
    const state = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#path = dependencies.statePath ?? join(state, "omadigest", "release-update.json");
    this.#fetch = dependencies.fetch ?? globalThis.fetch;
    this.#now = dependencies.now ?? (() => new Date());
    this.#cache = this.#read();
  }

  status(message?: string): ReleaseUpdateStatus {
    const cache = this.#cache;
    if (cache === undefined) return {
      state: "unknown", currentVersion: this.#currentVersion, dismissed: false, ...(message ? { message } : {})
    };
    const latestVersion = normalizeVersion(cache.latestVersion);
    const available = compareVersions(latestVersion, this.#currentVersion) > 0;
    return {
      state: available ? "available" : "current",
      currentVersion: this.#currentVersion,
      latestVersion,
      releaseUrl: cache.releaseUrl,
      checkedAt: cache.checkedAt,
      dismissed: available && normalizeVersion(cache.dismissedVersion ?? "") === latestVersion,
      ...(message ? { message } : {})
    };
  }

  checkingStatus(): ReleaseUpdateStatus { return { ...this.status(), state: "checking", message: "Checking for updates…" }; }

  async check(force = false): Promise<ReleaseUpdateStatus> {
    const now = this.#now();
    const checkedAt = this.#cache === undefined ? Number.NaN : Date.parse(this.#cache.checkedAt);
    if (!force && Number.isFinite(checkedAt) && now.getTime() - checkedAt < CHECK_INTERVAL_MS) return this.status();
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": `OmaDigest/${this.#currentVersion}`,
        "X-GitHub-Api-Version": "2022-11-28"
      };
      if (this.#cache?.etag) headers["If-None-Match"] = this.#cache.etag;
      const response = await this.#fetch(LATEST_RELEASE_API, {
        method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.status === 304 && this.#cache !== undefined) {
        this.#cache = { ...this.#cache, checkedAt: now.toISOString() };
        this.#write(this.#cache);
        return this.status();
      }
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const body = await readBoundedJson(response);
      const release = z.object({ tag_name: versionSchema, draft: z.boolean(), prerelease: z.boolean() }).passthrough().parse(body);
      if (release.draft || release.prerelease) throw new Error("GitHub returned a non-stable release");
      const latestVersion = normalizeVersion(release.tag_name);
      const releaseUrl = `${RELEASE_BASE}${encodeURIComponent(release.tag_name)}`;
      this.#cache = {
        version: 1,
        checkedAt: now.toISOString(),
        latestVersion,
        releaseUrl,
        ...(boundedEtag(response.headers.get("etag")) ? { etag: boundedEtag(response.headers.get("etag")) } : {}),
        ...(this.#cache?.dismissedVersion ? { dismissedVersion: this.#cache.dismissedVersion } : {})
      };
      this.#write(this.#cache);
      return this.status();
    } catch {
      return this.status("Couldn’t check for updates right now.");
    }
  }

  dismiss(): ReleaseUpdateStatus {
    if (this.#cache !== undefined && compareVersions(this.#cache.latestVersion, this.#currentVersion) > 0) {
      this.#cache = { ...this.#cache, dismissedVersion: this.#cache.latestVersion };
      this.#write(this.#cache);
    }
    return this.status();
  }

  releaseUrl(): string | undefined { return this.status().releaseUrl; }

  #read(): UpdateCache | undefined {
    try {
      if (!existsSync(this.#path) || statSync(this.#path).size > MAX_STATE_BYTES) return undefined;
      return cacheSchema.parse(JSON.parse(readFileSync(this.#path, "utf8")));
    } catch { return undefined; }
  }

  #write(value: UpdateCache): void {
    const serialized = `${JSON.stringify(cacheSchema.parse(value), null, 2)}\n`;
    if (Buffer.byteLength(serialized) > MAX_STATE_BYTES) throw new Error("Update state is too large");
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, serialized, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (a === undefined || b === undefined) return 0;
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function normalizeVersion(value: string): string { return value.startsWith("v") ? value.slice(1) : value; }
function parseVersion(value: string): [number, number, number] | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}
function boundedEtag(value: string | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  return /^[\x20-\x7e]{1,512}$/.test(trimmed) ? trimmed : undefined;
}
async function readBoundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new Error("Release response is too large");
  if (response.body === null) throw new Error("Release response is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("Release response is too large");
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString("utf8"));
}
