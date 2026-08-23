import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import { groupAttentionItems } from "./intelligence.js";
import type { AttentionActivity, AttentionItem, AttentionProposal, AttentionWakeReason, AttentionWatch } from "./types.js";

export const ATTENTION_DAILY_LIMIT = 24;
export const ATTENTION_MINIMUM_INTERVAL_MS = 60_000;
export const ATTENTION_MAX_FOLLOW_UP_MINUTES = 24 * 60;
export const ATTENTION_MAX_WATCH_ATTEMPTS = 3;
const MAX_WATCHES = 16;
const MAX_DECISIONS = 64;
const MAX_STATE_BYTES = 256 * 1024;
const WATCH_RETENTION_MS = 48 * 60 * 60 * 1_000;

const sourceIdSchema = z.string().min(1).max(200);
const reasonSchema = z.string().min(1).max(300);
const watchConditionSchema = z.enum(["new-evidence", "source-change", "deadline"]);
const watchSchema = z.object({
  id: z.string().uuid(),
  reason: reasonSchema,
  subject: z.string().min(1).max(200),
  sourceIds: z.array(sourceIdSchema).min(1).max(50),
  wakeOn: z.array(watchConditionSchema).min(1).max(3),
  createdAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  attempts: z.number().int().min(1).max(ATTENTION_MAX_WATCH_ATTEMPTS)
}).strict();
const decisionSchema = z.object({
  at: z.string().datetime(),
  action: z.enum(["hold", "digest", "notify", "error"]),
  reason: z.string().max(300),
  sourceIds: z.array(sourceIdSchema).max(50)
}).strict();
const budgetSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  deliberations: z.number().int().min(0).max(ATTENTION_DAILY_LIMIT),
  lastAt: z.string().datetime().optional()
}).strict();
const fileSchema = z.object({
  version: z.literal(2),
  watches: z.array(watchSchema).max(MAX_WATCHES),
  decisions: z.array(decisionSchema).max(MAX_DECISIONS),
  budget: budgetSchema
}).strict();

type StoredDecision = z.infer<typeof decisionSchema>;
type StoredState = z.infer<typeof fileSchema>;

export type ProposalValidationContext = {
  availableSourceIds: ReadonlySet<string>;
  currentSourceIds: ReadonlySet<string>;
  availableTemplateIds: ReadonlySet<string>;
  allowHold: boolean;
  allowDigest: boolean;
  allowNotify: boolean;
  manual: boolean;
};

const proposalSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("hold"), reason: reasonSchema,
    sourceIds: z.array(sourceIdSchema).min(1).max(50),
    subject: z.string().min(1).max(200),
    wakeOn: z.array(watchConditionSchema).min(1).max(3),
    followUpMinutes: z.number().int().min(1).max(ATTENTION_MAX_FOLLOW_UP_MINUTES)
  }).strict(),
  z.object({
    action: z.literal("digest"), reason: reasonSchema,
    sourceIds: z.array(sourceIdSchema).min(1).max(50),
    templateId: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/)
  }).strict(),
  z.object({
    action: z.literal("notify"), reason: reasonSchema,
    sourceIds: z.array(sourceIdSchema).min(1).max(50),
    headline: z.string().min(1).max(120), body: z.string().min(1).max(500),
    urgency: z.enum(["normal", "critical"])
  }).strict()
]);

export function validateAttentionProposal(raw: unknown, context: ProposalValidationContext): AttentionProposal {
  const proposal = proposalSchema.parse(raw);
  if (new Set(proposal.sourceIds).size !== proposal.sourceIds.length)
    throw new Error("An attention proposal cannot repeat source IDs");
  if (!proposal.sourceIds.every((id) => context.availableSourceIds.has(id)))
    throw new Error("An attention proposal referenced unavailable evidence");
  if (!proposal.sourceIds.some((id) => context.currentSourceIds.has(id)))
    throw new Error("An attention proposal must cite current evidence");
  if (proposal.action === "digest" && !context.availableTemplateIds.has(proposal.templateId))
    throw new Error("An attention proposal selected an unavailable template");
  if (proposal.action === "hold" && (!context.allowHold || context.manual))
    throw new Error(context.manual ? "A manual request must produce a digest" : "This watch has reached its follow-up limit");
  if (context.manual && proposal.action !== "digest")
    throw new Error("A manual request must produce a digest");
  if (proposal.action === "digest" && !context.manual && !context.allowDigest)
    throw new Error("This evidence should wait for a stronger digest signal");
  if (proposal.action === "notify" && !context.allowNotify)
    throw new Error("This evidence does not meet the interruption threshold");
  return proposal;
}

export class AttentionLedger {
  readonly #path: string;
  #state: StoredState;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const root = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#path = join(root, "omadigest", "attention-loop.json");
    this.#state = emptyState(new Date());
    this.#load(new Date());
  }

  permit(reason: AttentionWakeReason, now = new Date()): { allowed: boolean; reason?: string; retryAfterMs?: number } {
    this.#rollBudget(now);
    if (reason !== "manual" && this.#state.budget.deliberations >= ATTENTION_DAILY_LIMIT)
      return { allowed: false, reason: "Daily attention-agent limit reached" };
    const last = Date.parse(this.#state.budget.lastAt ?? "");
    const bypassInterval = reason === "manual";
    if (!bypassInterval && Number.isFinite(last) && now.getTime() - last < ATTENTION_MINIMUM_INTERVAL_MS)
      return {
        allowed: false,
        reason: "Waiting before another attention review",
        retryAfterMs: ATTENTION_MINIMUM_INTERVAL_MS - (now.getTime() - last)
      };
    return { allowed: true };
  }

  recordDeliberation(now = new Date(), counted = true): void {
    this.#rollBudget(now);
    if (counted) this.#state.budget.deliberations += 1;
    this.#state.budget.lastAt = now.toISOString();
    this.#save(now);
  }

  schedule(proposal: Extract<AttentionProposal, { action: "hold" }>, now = new Date(), previous?: AttentionWatch): AttentionWatch {
    const attempts = (previous?.attempts ?? 0) + 1;
    if (attempts > ATTENTION_MAX_WATCH_ATTEMPTS) throw new Error("This watch has reached its follow-up limit");
    const dueAt = new Date(now.getTime() + proposal.followUpMinutes * 60_000);
    const watch: AttentionWatch = {
      id: previous?.id ?? randomUUID(),
      reason: proposal.reason,
      subject: proposal.subject,
      sourceIds: [...new Set(proposal.sourceIds)].slice(0, 50),
      wakeOn: [...new Set(proposal.wakeOn)].slice(0, 3),
      createdAt: previous?.createdAt ?? now.toISOString(),
      dueAt: dueAt.toISOString(),
      expiresAt: new Date(Math.min(
        Date.parse(previous?.expiresAt ?? new Date(now.getTime() + WATCH_RETENTION_MS).toISOString()),
        now.getTime() + WATCH_RETENTION_MS
      )).toISOString(),
      attempts
    };
    this.#state.watches = this.#state.watches.filter((candidate) => candidate.id !== watch.id);
    this.#state.watches.push(watch);
    this.#state.watches = this.#state.watches.slice(-MAX_WATCHES);
    this.recordDecision("hold", proposal.reason, proposal.sourceIds, now, false);
    this.#save(now);
    return watch;
  }

  due(now = new Date()): AttentionWatch[] {
    this.#prune(now);
    return this.#state.watches.filter((watch) => Date.parse(watch.dueAt) <= now.getTime()).slice(0, 4);
  }

  active(now = new Date()): AttentionWatch[] {
    this.#prune(now);
    return this.#state.watches.map((watch) => ({ ...watch, sourceIds: [...watch.sourceIds] }));
  }

  get(id: string, now = new Date()): AttentionWatch | undefined {
    return this.active(now).find((watch) => watch.id === id);
  }

  cancel(id: string, now = new Date()): AttentionWatch | undefined {
    const watch = this.#state.watches.find((candidate) => candidate.id === id);
    if (watch === undefined) return undefined;
    this.#state.watches = this.#state.watches.filter((candidate) => candidate.id !== id);
    this.recordDecision("hold", `cancelled: ${watch.reason}`, watch.sourceIds, now, false);
    this.#save(now);
    return { ...watch, sourceIds: [...watch.sourceIds], wakeOn: [...watch.wakeOn] };
  }

  matching(items: AttentionItem[], now = new Date()): Array<{ watch: AttentionWatch; sourceIds: string[] }> {
    const active = this.active(now);
    if (active.length === 0 || items.length === 0) return [];
    const groups = groupAttentionItems(items);
    return active.flatMap((watch) => {
      const watched = new Set(watch.sourceIds);
      const sameSource = items.filter((item) => watched.has(item.id)).map((item) => item.id);
      const sameSubject = groups.filter((group) => normalizeSubject(group.subject) === normalizeSubject(watch.subject))
        .flatMap((group) => group.sourceIds).filter((id) => !watched.has(id));
      const matched = new Set<string>();
      if (watch.wakeOn.includes("source-change")) for (const id of sameSource) matched.add(id);
      if (watch.wakeOn.includes("new-evidence")) for (const id of sameSubject) matched.add(id);
      return matched.size === 0 ? [] : [{ watch, sourceIds: [...matched].slice(0, 50) }];
    }).slice(0, 4);
  }

  heldIds(now = new Date()): Set<string> {
    return new Set(this.active(now).filter((watch) => Date.parse(watch.dueAt) > now.getTime()).flatMap((watch) => watch.sourceIds));
  }

  resolve(action: "digest" | "notify", reason: string, sourceIds: string[], now = new Date(), watchId?: string): void {
    const resolved = new Set(sourceIds);
    this.#state.watches = this.#state.watches.filter((watch) =>
      watch.id !== watchId && !watch.sourceIds.some((id) => resolved.has(id)));
    this.recordDecision(action, reason, sourceIds, now, false);
    this.#save(now);
  }

  recordError(reason: string, now = new Date()): void {
    this.recordDecision("error", reason.slice(0, 300), [], now);
  }

  activity(state: AttentionActivity["state"], message: string, now = new Date()): AttentionActivity {
    const active = this.active(now);
    const next = active.map((watch) => watch.dueAt).sort()[0];
    this.#rollBudget(now);
    return {
      state, message: message.slice(0, 300), heldCount: new Set(active.flatMap((watch) => watch.sourceIds)).size,
      ...(next === undefined ? {} : { nextCheckAt: next }),
      dailyDeliberations: this.#state.budget.deliberations,
      dailyLimit: ATTENTION_DAILY_LIMIT
    };
  }

  clear(): void {
    this.#state = emptyState(new Date());
    rmSync(this.#path, { force: true });
  }

  private recordDecision(action: StoredDecision["action"], reason: string, sourceIds: string[], now: Date, save = true): void {
    this.#state.decisions.push({ at: now.toISOString(), action, reason: reason.slice(0, 300), sourceIds: sourceIds.slice(0, 50) });
    this.#state.decisions = this.#state.decisions.slice(-MAX_DECISIONS);
    if (save) this.#save(now);
  }

  #load(now: Date): void {
    try {
      if (!existsSync(this.#path) || statSync(this.#path).size > MAX_STATE_BYTES) return;
      const raw: unknown = JSON.parse(readFileSync(this.#path, "utf8"));
      this.#state = migrateState(raw);
      this.#prune(now);
    } catch { this.#state = emptyState(now); }
  }

  #rollBudget(now: Date): void {
    const day = now.toISOString().slice(0, 10);
    if (this.#state.budget.day !== day) this.#state.budget = { day, deliberations: 0 };
  }

  #prune(now: Date): void {
    this.#rollBudget(now);
    this.#state.watches = this.#state.watches.filter((watch) =>
      Date.parse(watch.expiresAt) > now.getTime()).slice(-MAX_WATCHES);
    this.#state.decisions = this.#state.decisions.filter((decision) =>
      Date.parse(decision.at) > now.getTime() - 7 * 86_400_000).slice(-MAX_DECISIONS);
  }

  #save(now: Date): void {
    this.#prune(now);
    const serialized = `${JSON.stringify(this.#state, null, 2)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) throw new Error("Attention-loop state is too large");
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, serialized, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

function emptyState(now: Date): StoredState {
  return { version: 2, watches: [], decisions: [], budget: { day: now.toISOString().slice(0, 10), deliberations: 0 } };
}

function normalizeSubject(value: string): string {
  const normalized = value.trim().toLowerCase().replaceAll(/\s+/gu, " ").slice(0, 200);
  const explicit = /\b(pr|pull request|issue|ticket|task)[-\s#]*(\d{1,9})\b/u.exec(normalized);
  if (explicit !== null) return `${explicit[1] === "pull request" ? "pr" : explicit[1]}-${explicit[2]}`;
  return normalized;
}

function migrateState(raw: unknown): StoredState {
  const current = fileSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = z.object({
    version: z.literal(1),
    watches: z.array(z.object({
      id: z.string().uuid(), reason: reasonSchema, sourceIds: z.array(sourceIdSchema).min(1).max(50),
      createdAt: z.string().datetime(), dueAt: z.string().datetime(), expiresAt: z.string().datetime(),
      attempts: z.number().int().min(1).max(ATTENTION_MAX_WATCH_ATTEMPTS)
    }).strict()).max(MAX_WATCHES),
    decisions: z.array(decisionSchema).max(MAX_DECISIONS),
    budget: budgetSchema
  }).strict().parse(raw);
  return fileSchema.parse({
    version: 2,
    watches: legacy.watches.map((watch) => ({
      ...watch,
      subject: watch.reason.slice(0, 200),
      wakeOn: ["deadline"]
    })),
    decisions: legacy.decisions,
    budget: legacy.budget
  });
}
