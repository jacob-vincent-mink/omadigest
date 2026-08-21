import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AttentionItem } from "./types.js";

export const privacyModeSchema = z.enum(["ignore", "count-only", "digest", "digest-and-handoff"]);
export type PrivacyMode = z.infer<typeof privacyModeSchema>;

const legacyFileSchema = z.object({
  version: z.literal(1),
  defaultMode: privacyModeSchema,
  applications: z.record(z.string().min(1).max(120), privacyModeSchema)
}).strict();
const fileSchema = z.object({ version: z.literal(2), nativeMode: privacyModeSchema }).strict();

export class PrivacyPolicy {
  readonly #path: string;
  #defaultMode: PrivacyMode = "count-only";

  constructor(configRoot: string) {
    this.#path = join(configRoot, "privacy.json");
    this.#load();
    if (!existsSync(this.#path)) this.#save();
  }

  reload(): void {
    this.#defaultMode = "count-only";
    this.#load();
  }

  status(): { defaultMode: PrivacyMode; rules: [] } {
    return { defaultMode: this.#defaultMode, rules: [] };
  }

  setDefault(mode: PrivacyMode): void {
    this.#defaultMode = privacyModeSchema.parse(mode);
    this.#save();
  }

  filter(item: AttentionItem): AttentionItem | undefined {
    if (item.source !== "notifications") return item;
    if (this.#defaultMode === "ignore") return undefined;
    if (this.#defaultMode === "count-only") return hiddenItem(item);
    return item;
  }

  evidenceForHandoff(items: AttentionItem[]): AttentionItem[] {
    return items.flatMap((item) => {
      if (!isActionableEvidence(item)) return [];
      if (item.source !== "notifications") return [item];
      return this.#defaultMode === "digest-and-handoff" ? [item] : [];
    });
  }

  evidenceForDigest(items: AttentionItem[]): AttentionItem[] {
    return items.filter((item) => {
      if (!isActionableEvidence(item)) return false;
      if (item.source !== "notifications") return true;
      return this.#defaultMode === "digest" || this.#defaultMode === "digest-and-handoff";
    });
  }

  selectDigestEvidence(items: AttentionItem[], maximumItems: number): { items: AttentionItem[]; excludedIds: string[] } {
    const eligible = this.evidenceForDigest(items.slice(0, 200));
    const eligibleIds = new Set(eligible.map((item) => item.id));
    return {
      items: eligible.slice(0, Math.max(1, Math.min(200, maximumItems))),
      excludedIds: items.slice(0, 200).filter((item) => !eligibleIds.has(item.id)).map((item) => item.id)
    };
  }

  #load(): void {
    try {
      if (statSync(this.#path).size > 1024 * 1024) return;
      const raw: unknown = JSON.parse(readFileSync(this.#path, "utf8"));
      const current = fileSchema.safeParse(raw);
      if (current.success) this.#defaultMode = current.data.nativeMode;
      else {
        const legacy = legacyFileSchema.parse(raw);
        this.#defaultMode = legacy.defaultMode === "ignore" ? "ignore" : "count-only";
        this.#save();
      }
    } catch { /* Use strict defaults. */ }
  }

  #save(): void {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const value = { version: 2 as const, nativeMode: this.#defaultMode };
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

export function normalizeApplication(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ").slice(0, 120);
}

function hiddenItem(item: AttentionItem): AttentionItem {
  const { intent: _intent, ...safe } = item;
  return { ...safe, title: "", body: "", contentAvailable: false };
}

export function isActionableEvidence(item: AttentionItem): boolean {
  if (item.contentAvailable === false) return false;
  if (item.title === "Notification content hidden by privacy policy") return false;
  return item.title.trim() !== "" || item.body.trim() !== "";
}
