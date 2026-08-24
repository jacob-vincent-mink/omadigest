import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ResearchCadence, ResearchChange, ResearchClaim, ResearchDepth, ResearchRun, ResearchWatch } from "./types.js";

export const MAX_RESEARCH_WATCHES = 16;
export const MAX_RESEARCH_RUNS_PER_WATCH = 12;
export const RESEARCH_RETENTION_DAYS = 90;
export const MAX_RESEARCH_CONFIG_BYTES = 128 * 1024;
export const MAX_RESEARCH_HISTORY_BYTES = 1024 * 1024;

const cadenceSchema = z.enum(["hourly", "six-hourly", "daily", "weekly"]);
const depthSchema = z.enum(["focused", "broad", "deep"]);
const recencySchema = z.enum(["day", "week", "month", "anytime"]);
const urlSchema = z.string().url().max(2_048).superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hash !== "")
    context.addIssue({ code: "custom", message: "Research sources must be credential-free HTTPS URLs without fragments" });
});
export const researchWatchInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  question: z.string().trim().min(3).max(1_000),
  cadence: cadenceSchema,
  depth: depthSchema.default("broad"),
  recency: recencySchema.default("month"),
  sourceUrls: z.array(urlSchema).max(8)
}).strict();
const watchSchema = researchWatchInputSchema.extend({
  id: z.string().uuid(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  nextRunAt: z.string().datetime(),
  lastRunAt: z.string().datetime().optional()
}).strict();
const evidenceSchema = z.object({
  url: urlSchema,
  title: z.string().max(200),
  retrievedAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  excerptHash: z.string().regex(/^[a-f0-9]{64}$/u)
}).strict();
const claimSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/u),
  statement: z.string().min(1).max(800),
  significance: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceSchema).min(1).max(4)
}).strict();
const changeSchema = z.object({
  kind: z.enum(["new", "changed", "no-longer-supported"]),
  key: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/u),
  statement: z.string().min(1).max(800),
  previousStatement: z.string().min(1).max(800).optional(),
  significance: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  evidence: z.array(evidenceSchema).max(4)
}).strict();
const runSchema = z.object({
  id: z.string().uuid(),
  watchId: z.string().uuid(),
  watchName: z.string().min(1).max(100),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  status: z.enum(["complete", "error"]),
  summary: z.string().max(1_200),
  baseline: z.boolean(),
  meaningfulChange: z.boolean(),
  claims: z.array(claimSchema).max(24),
  changes: z.array(changeSchema).max(24),
  depth: depthSchema.optional(),
  searchCount: z.number().int().min(0).max(20).optional(),
  readCount: z.number().int().min(0).max(60).optional(),
  corpusChars: z.number().int().min(0).max(480_000).optional(),
  error: z.string().max(500).optional()
}).strict();
const configSchema = z.object({ version: z.literal(1), watches: z.array(watchSchema).max(MAX_RESEARCH_WATCHES) }).strict();
const historySchema = z.object({ version: z.literal(1), runs: z.array(runSchema).max(MAX_RESEARCH_WATCHES * MAX_RESEARCH_RUNS_PER_WATCH) }).strict();

export class ResearchWatchStore {
  readonly #configPath: string;
  readonly #historyPath: string;
  #watches: ResearchWatch[] = [];
  #runs: ResearchRun[] = [];

  constructor(env: NodeJS.ProcessEnv = process.env, now = new Date()) {
    const config = env.XDG_CONFIG_HOME?.startsWith("/")
      ? env.XDG_CONFIG_HOME : env.HOME?.startsWith("/") ? join(env.HOME, ".config") : "/tmp";
    const state = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#configPath = join(config, "omadigest", "research-watches.json");
    this.#historyPath = join(state, "omadigest", "research-history.json");
    this.#load(now);
  }

  watches(): ResearchWatch[] { return this.#watches.map((watch) => ({ ...watch, sourceUrls: [...watch.sourceUrls] })); }
  runs(): ResearchRun[] { return structuredClone(this.#runs); }
  get(id: string): ResearchWatch | undefined { return this.watches().find((watch) => watch.id === id); }
  latestRun(watchId: string): ResearchRun | undefined { return this.runs().find((run) => run.watchId === watchId && run.status === "complete"); }
  due(now = new Date()): ResearchWatch[] {
    return this.watches().filter((watch) => watch.enabled && Date.parse(watch.nextRunAt) <= now.getTime()).slice(0, 4);
  }

  reload(now = new Date()): void {
    this.#watches = [];
    this.#runs = [];
    this.#load(now);
  }

  create(raw: unknown, now = new Date()): ResearchWatch {
    if (this.#watches.length >= MAX_RESEARCH_WATCHES) throw new Error(`Research is limited to ${MAX_RESEARCH_WATCHES} active watches`);
    const input = researchWatchInputSchema.parse(raw);
    const watch = watchSchema.parse({
      ...input, id: randomUUID(), enabled: true,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), nextRunAt: now.toISOString()
    }) as ResearchWatch;
    this.#watches.push(watch);
    this.#saveConfig();
    return { ...watch, sourceUrls: [...watch.sourceUrls] };
  }

  setEnabled(id: string, enabled: boolean, now = new Date()): ResearchWatch | undefined {
    let changed: ResearchWatch | undefined;
    this.#watches = this.#watches.map((watch) => {
      if (watch.id !== id) return watch;
      changed = {
        ...watch, enabled, updatedAt: now.toISOString(),
        nextRunAt: enabled ? now.toISOString() : watch.nextRunAt
      };
      return changed;
    });
    if (changed !== undefined) this.#saveConfig();
    return changed === undefined ? undefined : { ...changed, sourceUrls: [...changed.sourceUrls] };
  }

  updateResearchPolicy(id: string, depth: ResearchWatch["depth"], recency: ResearchWatch["recency"], now = new Date()): ResearchWatch | undefined {
    const safeDepth = depthSchema.parse(depth);
    const safeRecency = recencySchema.parse(recency);
    let changed: ResearchWatch | undefined;
    this.#watches = this.#watches.map((watch) => {
      if (watch.id !== id) return watch;
      changed = { ...watch, depth: safeDepth, recency: safeRecency, updatedAt: now.toISOString() };
      return changed;
    });
    if (changed !== undefined) this.#saveConfig();
    return changed === undefined ? undefined : { ...changed, sourceUrls: [...changed.sourceUrls] };
  }

  delete(id: string): boolean {
    const before = this.#watches.length;
    this.#watches = this.#watches.filter((watch) => watch.id !== id);
    if (this.#watches.length === before) return false;
    this.#runs = this.#runs.filter((run) => run.watchId !== id);
    this.#saveConfig();
    this.#saveHistory(new Date());
    return true;
  }

  record(run: ResearchRun, now = new Date()): void {
    const safe = runSchema.parse(run) as ResearchRun;
    this.#runs = [safe, ...this.#runs.filter((candidate) => candidate.id !== safe.id)];
    this.#runs = boundedRuns(this.#runs, now);
    this.#watches = this.#watches.map((watch) => watch.id !== run.watchId ? watch : ({
      ...watch, lastRunAt: run.completedAt, updatedAt: now.toISOString(),
      nextRunAt: new Date(now.getTime() + cadenceMilliseconds(watch.cadence)).toISOString()
    }));
    this.#saveConfig();
    this.#saveHistory(now);
  }

  clear(): void {
    this.#watches = [];
    this.#runs = [];
    rmSync(this.#configPath, { force: true });
    rmSync(this.#historyPath, { force: true });
  }

  #load(now: Date): void {
    try {
      if (existsSync(this.#configPath) && statSync(this.#configPath).size <= MAX_RESEARCH_CONFIG_BYTES)
        this.#watches = configSchema.parse(JSON.parse(readFileSync(this.#configPath, "utf8"))).watches as ResearchWatch[];
    } catch { this.#watches = []; }
    try {
      if (existsSync(this.#historyPath) && statSync(this.#historyPath).size <= MAX_RESEARCH_HISTORY_BYTES)
        this.#runs = boundedRuns(historySchema.parse(JSON.parse(readFileSync(this.#historyPath, "utf8"))).runs as ResearchRun[], now);
    } catch { this.#runs = []; }
  }

  #saveConfig(): void { writePrivateJson(this.#configPath, { version: 1, watches: this.#watches }, MAX_RESEARCH_CONFIG_BYTES); }
  #saveHistory(now: Date): void {
    this.#runs = boundedRuns(this.#runs, now);
    while (this.#runs.length > 0) {
      try { writePrivateJson(this.#historyPath, { version: 1, runs: this.#runs }, MAX_RESEARCH_HISTORY_BYTES); return; }
      catch { this.#runs.pop(); }
    }
    writePrivateJson(this.#historyPath, { version: 1, runs: [] }, MAX_RESEARCH_HISTORY_BYTES);
  }
}

export function cadenceMilliseconds(cadence: ResearchCadence): number {
  return cadence === "hourly" ? 60 * 60_000
    : cadence === "six-hourly" ? 6 * 60 * 60_000
      : cadence === "daily" ? 24 * 60 * 60_000 : 7 * 24 * 60 * 60_000;
}

export function researchDepthBudget(depth: ResearchDepth): {
  searches: number; reads: number; corpusChars: number; timeoutMs: number; automaticWeight: number;
} {
  if (depth === "focused") return { searches: 4, reads: 12, corpusChars: 120_000, timeoutMs: 90_000, automaticWeight: 1 };
  if (depth === "deep") return { searches: 20, reads: 60, corpusChars: 480_000, timeoutMs: 300_000, automaticWeight: 4 };
  return { searches: 10, reads: 30, corpusChars: 300_000, timeoutMs: 180_000, automaticWeight: 2 };
}

export function diffResearchClaims(previous: ResearchClaim[], current: ResearchClaim[]): ResearchChange[] {
  const before = new Map(previous.slice(0, 24).map((claim) => [claim.key, claim]));
  const after = new Map(current.slice(0, 24).map((claim) => [claim.key, claim]));
  const changes: ResearchChange[] = [];
  for (const claim of current.slice(0, 24)) {
    const prior = before.get(claim.key);
    if (prior === undefined) {
      changes.push({ kind: "new", ...claim });
      continue;
    }
    if (normalizedClaim(prior.statement) !== normalizedClaim(claim.statement))
      changes.push({ kind: "changed", ...claim, previousStatement: prior.statement });
  }
  for (const claim of previous.slice(0, 24)) if (!after.has(claim.key)) changes.push({
    kind: "no-longer-supported", key: claim.key, statement: claim.statement,
    previousStatement: claim.statement, significance: claim.significance,
    confidence: claim.confidence, evidence: []
  });
  return changes.slice(0, 24);
}

function normalizedClaim(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/gu, " ").replaceAll(/[.!?]+$/gu, "").trim();
}

function boundedRuns(runs: ResearchRun[], now: Date): ResearchRun[] {
  const cutoff = now.getTime() - RESEARCH_RETENTION_DAYS * 86_400_000;
  const counts = new Map<string, number>();
  return [...runs].sort((left, right) => right.completedAt.localeCompare(left.completedAt)).filter((run) => {
    if (Date.parse(run.completedAt) < cutoff) return false;
    const count = counts.get(run.watchId) ?? 0;
    if (count >= MAX_RESEARCH_RUNS_PER_WATCH) return false;
    counts.set(run.watchId, count + 1);
    return true;
  }).slice(0, MAX_RESEARCH_WATCHES * MAX_RESEARCH_RUNS_PER_WATCH);
}

function writePrivateJson(path: string, value: unknown, maximumBytes: number): void {
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(payload, "utf8") > maximumBytes) throw new Error("Research state exceeded its storage budget");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, payload, { mode: 0o600 });
  renameSync(temporary, path);
}
