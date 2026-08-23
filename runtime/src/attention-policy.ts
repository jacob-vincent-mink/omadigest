import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { attentionEntityKeys, classifyAttentionItem } from "./intelligence.js";
import type { AttentionItem, AttentionPolicy, AttentionPolicyPreview } from "./types.js";

export const MAX_ATTENTION_POLICIES = 32;
export const MAX_ATTENTION_POLICY_BYTES = 128 * 1024;

const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const matcherSchema = z.object({
  applications: z.array(z.string().min(1).max(120)).max(16).optional(),
  sources: z.array(z.string().min(1).max(80)).max(16).optional(),
  intents: z.array(z.enum([
    "failure", "review", "deadline", "meeting", "assignment", "mention",
    "request", "completion", "system", "update"
  ])).max(10).optional(),
  urgencies: z.array(z.enum(["low", "normal", "critical"])).max(3).optional(),
  entities: z.array(z.string().min(1).max(160)).max(16).optional(),
  contains: z.array(z.string().min(2).max(80)).max(16).optional()
}).strict().refine((match) => Object.values(match).some((values) => Array.isArray(values) && values.length > 0), {
  message: "A standing policy needs at least one bounded match condition"
});

export const attentionPolicyDraftSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(300),
  priority: z.number().int().min(0).max(100),
  action: z.enum(["ignore", "hold", "digest", "notify"]),
  match: matcherSchema,
  templateId: idSchema.optional(),
  followUpMinutes: z.number().int().min(5).max(1440).optional()
}).strict().superRefine((draft, context) => {
  if (draft.action === "digest" && draft.templateId === undefined)
    context.addIssue({ code: "custom", message: "Digest policies require a template" });
  if (draft.action === "hold" && draft.followUpMinutes === undefined)
    context.addIssue({ code: "custom", message: "Hold policies require a follow-up interval" });
  if (draft.action === "notify") {
    const urgentIntent = draft.match.intents?.some((intent) => ["failure", "deadline", "meeting"].includes(intent)) === true;
    const critical = draft.match.urgencies?.includes("critical") === true;
    if (!urgentIntent && !critical)
      context.addIssue({ code: "custom", message: "Notify policies must target critical, failure, deadline, or meeting evidence" });
  }
});

const policySchema = attentionPolicyDraftSchema.safeExtend({
  id: idSchema,
  enabled: z.boolean(),
  createdAt: z.string().datetime()
});
const stateSchema = z.object({ version: z.literal(1), policies: z.array(policySchema).max(MAX_ATTENTION_POLICIES) }).strict();

export type AttentionPolicyDraft = z.infer<typeof attentionPolicyDraftSchema>;
export type AttentionPolicyMatch = { policy: AttentionPolicy; items: AttentionItem[] };

export class AttentionPolicyStore {
  readonly #path: string;
  #policies: AttentionPolicy[] = [];

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const config = env.XDG_CONFIG_HOME?.startsWith("/")
      ? env.XDG_CONFIG_HOME
      : env.HOME?.startsWith("/") ? join(env.HOME, ".config") : "/tmp";
    this.#path = join(config, "omadigest", "attention-policies.json");
    this.#load();
  }

  list(): AttentionPolicy[] {
    return this.#policies.map((policy) => ({ ...policy, match: cloneMatch(policy.match) }));
  }

  add(raw: AttentionPolicyDraft, now = new Date()): AttentionPolicy {
    const draft = attentionPolicyDraftSchema.parse(raw);
    const base = slug(draft.name);
    let id = base;
    for (let suffix = 2; this.#policies.some((policy) => policy.id === id); suffix += 1) id = `${base.slice(0, 72)}-${suffix}`;
    const policy = policySchema.parse({ ...draft, id, enabled: true, createdAt: now.toISOString() }) as AttentionPolicy;
    this.#policies = [...this.#policies, policy]
      .sort((left, right) => right.priority - left.priority || left.createdAt.localeCompare(right.createdAt))
      .slice(0, MAX_ATTENTION_POLICIES);
    this.#save();
    return { ...policy, match: cloneMatch(policy.match) };
  }

  setEnabled(id: string, enabled: boolean): AttentionPolicy | undefined {
    let updated: AttentionPolicy | undefined;
    this.#policies = this.#policies.map((policy) => {
      if (policy.id !== id) return policy;
      updated = { ...policy, enabled };
      return updated;
    });
    if (updated !== undefined) this.#save();
    return updated === undefined ? undefined : { ...updated, match: cloneMatch(updated.match) };
  }

  delete(id: string): boolean {
    const before = this.#policies.length;
    this.#policies = this.#policies.filter((policy) => policy.id !== id);
    if (this.#policies.length === before) return false;
    this.#save();
    return true;
  }

  evaluate(items: AttentionItem[]): AttentionPolicyMatch[] {
    const safe = items.slice(0, 200).map(classifyAttentionItem);
    return this.#policies.filter((policy) => policy.enabled).flatMap((policy) => {
      const matched = safe.filter((item) => matches(policy, item)).slice(0, 100);
      return matched.length === 0 ? [] : [{ policy: { ...policy, match: cloneMatch(policy.match) }, items: matched }];
    }).sort((left, right) => right.policy.priority - left.policy.priority || left.policy.id.localeCompare(right.policy.id));
  }

  preview(raw: AttentionPolicyDraft, items: AttentionItem[]): Omit<AttentionPolicyPreview, "id" | "expiresAt"> {
    const draft = attentionPolicyDraftSchema.parse(raw);
    const candidate = policySchema.parse({
      ...draft, id: "preview", enabled: true, createdAt: new Date(0).toISOString()
    }) as AttentionPolicy;
    const matched = items.slice(0, 200).map(classifyAttentionItem)
      .filter((item) => matches(candidate, item)).slice(0, 100);
    const conflicts = this.#policies.filter((policy) => policy.enabled
      && policy.action !== candidate.action && potentiallyOverlaps(policy.match, candidate.match))
      .map((policy) => ({
        policyId: policy.id,
        name: policy.name,
        action: policy.action,
        priority: policy.priority,
        winner: draft.priority > policy.priority ? "draft" as const : "existing" as const
      })).sort((left, right) => right.priority - left.priority || left.policyId.localeCompare(right.policyId)).slice(0, 8);
    return {
      draft: {
        name: candidate.name,
        description: candidate.description,
        priority: candidate.priority,
        action: candidate.action,
        match: cloneMatch(candidate.match),
        ...(candidate.templateId === undefined ? {} : { templateId: candidate.templateId }),
        ...(candidate.followUpMinutes === undefined ? {} : { followUpMinutes: candidate.followUpMinutes })
      },
      matchedCount: matched.length,
      examples: matched.slice(0, 3).map((item) => ({
        id: item.id,
        app: item.app.slice(0, 120),
        title: item.title.slice(0, 200)
      })),
      conflicts
    };
  }

  clear(): void {
    this.#policies = [];
    rmSync(this.#path, { force: true });
  }

  #load(): void {
    try {
      if (!existsSync(this.#path) || statSync(this.#path).size > MAX_ATTENTION_POLICY_BYTES) return;
      const parsed = stateSchema.parse(JSON.parse(readFileSync(this.#path, "utf8")));
      this.#policies = parsed.policies as AttentionPolicy[];
    } catch { this.#policies = []; }
  }

  #save(): void {
    const payload = `${JSON.stringify({ version: 1, policies: this.#policies }, null, 2)}\n`;
    if (Buffer.byteLength(payload, "utf8") > MAX_ATTENTION_POLICY_BYTES) throw new Error("Standing attention policies are too large");
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, payload, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

function matches(policy: AttentionPolicy, item: AttentionItem): boolean {
  const match = policy.match;
  const app = item.app.trim().toLowerCase();
  const source = item.source.trim().toLowerCase();
  const text = `${item.title}\n${item.body}`.toLowerCase().slice(0, 10_000);
  const entities = new Set(attentionEntityKeys(item));
  if (match.applications !== undefined && !match.applications.some((value) => app === value.trim().toLowerCase())) return false;
  if (match.sources !== undefined && !match.sources.some((value) => source === value.trim().toLowerCase())) return false;
  if (match.intents !== undefined && (item.intent === undefined || !match.intents.includes(item.intent))) return false;
  if (match.urgencies !== undefined && !match.urgencies.includes(item.urgency)) return false;
  if (match.entities !== undefined && !match.entities.some((value) => {
    const needle = normalizeEntity(value);
    return [...entities].some((entity) => entity === needle || entity.endsWith(`:${needle}`));
  })) return false;
  if (match.contains !== undefined && !match.contains.some((value) => text.includes(value.trim().toLowerCase()))) return false;
  return true;
}

function cloneMatch(match: AttentionPolicy["match"]): AttentionPolicy["match"] {
  return Object.fromEntries(Object.entries(match).map(([key, value]) => [key, value === undefined ? undefined : [...value]]));
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-").replaceAll(/^-+|-+$/gu, "").slice(0, 72);
  return normalized || `policy-${randomUUID().slice(0, 8)}`;
}

function normalizeEntity(value: string): string {
  return value.toLowerCase().replaceAll(/\s+/gu, " ").trim().slice(0, 160);
}

function potentiallyOverlaps(left: AttentionPolicy["match"], right: AttentionPolicy["match"]): boolean {
  for (const key of ["applications", "sources", "intents", "urgencies"] as const) {
    const leftValues = left[key]?.map((value) => String(value).trim().toLowerCase());
    const rightValues = right[key]?.map((value) => String(value).trim().toLowerCase());
    if (leftValues !== undefined && rightValues !== undefined
      && !leftValues.some((value) => rightValues.includes(value))) return false;
  }
  return true;
}
