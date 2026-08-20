import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Digest } from "./types.js";

const MAX_HISTORY_BYTES = 5 * 1024 * 1024;
const MAX_DIGESTS = 30;

type HistoryFile = { version: 1; digests: Digest[] };

export class DigestHistory {
  readonly #path: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const state = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME
      : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#path = join(state, "omadigest", "digests.json");
  }

  list(): Digest[] { return this.#read().digests; }
  get(id: string): Digest | undefined { return this.#read().digests.find((digest) => digest.id === id); }

  save(digest: Digest): void {
    const current = this.#read().digests.filter((item) => item.id !== digest.id);
    this.#write({ version: 1, digests: [digest, ...current].slice(0, MAX_DIGESTS) });
  }

  markRead(id: string, readAt = new Date().toISOString()): void {
    const current = this.#read().digests;
    this.#write({
      version: 1,
      digests: current.map((digest) => digest.id === id ? { ...digest, readAt } : digest)
    });
  }

  delete(id: string): void {
    const current = this.#read().digests;
    this.#write({ version: 1, digests: current.filter((item) => item.id !== id) });
  }

  clear(): void { this.#write({ version: 1, digests: [] }); }

  #read(): HistoryFile {
    try {
      if (statSync(this.#path).size > MAX_HISTORY_BYTES) return { version: 1, digests: [] };
      const value: unknown = JSON.parse(readFileSync(this.#path, "utf8"));
      if (!isObject(value) || value.version !== 1 || !Array.isArray(value.digests)) return { version: 1, digests: [] };
      return { version: 1, digests: value.digests.filter(isDigest).slice(0, MAX_DIGESTS) };
    } catch { return { version: 1, digests: [] }; }
  }

  #write(value: HistoryFile): void {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

function isDigest(value: unknown): value is Digest {
  if (!isObject(value) || typeof value.id !== "string" || typeof value.templateId !== "string"
    || typeof value.title !== "string" || typeof value.generatedAt !== "string"
    || (value.readAt !== undefined && typeof value.readAt !== "string") || !Array.isArray(value.sections)) return false;
  return value.sections.every((section) => isObject(section) && typeof section.title === "string" && Array.isArray(section.entries));
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
