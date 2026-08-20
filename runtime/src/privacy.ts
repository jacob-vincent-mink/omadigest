import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AttentionItem } from "./types.js";

export const privacyModeSchema = z.enum(["ignore", "count-only", "digest", "digest-and-handoff"]);
export type PrivacyMode = z.infer<typeof privacyModeSchema>;
export type PrivacyRule = { app: string; mode: PrivacyMode; source: "protected-default" | "user" };

const fileSchema = z.object({
  version: z.literal(1),
  defaultMode: privacyModeSchema,
  applications: z.record(z.string().min(1).max(120), privacyModeSchema)
}).strict();

const protectedDefaults: Array<{ app: string; aliases: string[] }> = [
  { app: "Signal", aliases: ["signal", "signal desktop", "signal-desktop", "org.signal.signal"] },
  { app: "WhatsApp", aliases: ["whatsapp", "whatsapp desktop"] },
  { app: "Telegram", aliases: ["telegram", "telegram desktop", "org.telegram.desktop"] },
  { app: "1Password", aliases: ["1password", "1password for linux"] },
  { app: "Bitwarden", aliases: ["bitwarden"] },
  { app: "KeePassXC", aliases: ["keepassxc", "keepass"] },
  { app: "Authy", aliases: ["authy"] }
];

const protectedAliases = new Map(protectedDefaults.flatMap((rule) =>
  rule.aliases.map((alias) => [normalizeApplication(alias), rule.app] as const)));

export class PrivacyPolicy {
  readonly #path: string;
  #defaultMode: PrivacyMode = "count-only";
  #applications = new Map<string, PrivacyMode>();

  constructor(configRoot: string) {
    this.#path = join(configRoot, "privacy.json");
    this.#load();
    if (!existsSync(this.#path)) this.#save();
  }

  reload(): void {
    this.#defaultMode = "count-only";
    this.#applications.clear();
    this.#load();
  }

  status(): { defaultMode: PrivacyMode; rules: PrivacyRule[] } {
    const rules = new Map<string, PrivacyRule>();
    for (const rule of protectedDefaults) {
      const key = normalizeApplication(rule.app);
      rules.set(key, { app: rule.app, mode: this.#applications.get(key) ?? "ignore", source: this.#applications.has(key) ? "user" : "protected-default" });
    }
    for (const [app, mode] of this.#applications) {
      if (!rules.has(app)) rules.set(app, { app, mode, source: "user" });
    }
    return { defaultMode: this.#defaultMode, rules: [...rules.values()].sort((left, right) => left.app.localeCompare(right.app)) };
  }

  setDefault(mode: PrivacyMode): void {
    this.#defaultMode = privacyModeSchema.parse(mode);
    this.#save();
  }

  setRule(app: string, mode: PrivacyMode): void {
    const normalized = normalizeApplication(app);
    if (normalized === "") throw new Error("Enter an application name.");
    this.#applications.set(normalized, privacyModeSchema.parse(mode));
    this.#save();
  }

  modeFor(app: string): PrivacyMode {
    const normalized = normalizeApplication(app);
    const explicit = this.#applications.get(normalized);
    if (explicit !== undefined) return explicit;
    const protectedName = protectedAliases.get(normalized);
    if (protectedName !== undefined) return this.#applications.get(normalizeApplication(protectedName)) ?? "ignore";
    return this.#defaultMode;
  }

  filter(item: AttentionItem): AttentionItem | undefined {
    if (item.source !== "notifications") return item;
    const mode = this.modeFor(item.app);
    if (mode === "ignore") return undefined;
    if (mode === "count-only") return hiddenItem(item);
    return item;
  }

  evidenceForHandoff(items: AttentionItem[]): AttentionItem[] {
    return items.flatMap((item) => {
      if (!isActionableEvidence(item)) return [];
      if (item.source !== "notifications") return [item];
      const mode = this.modeFor(item.app);
      return mode === "digest-and-handoff" ? [item] : [];
    });
  }

  evidenceForDigest(items: AttentionItem[]): AttentionItem[] {
    return items.filter((item) => {
      if (!isActionableEvidence(item)) return false;
      if (item.source !== "notifications") return true;
      const mode = this.modeFor(item.app);
      return mode === "digest" || mode === "digest-and-handoff";
    });
  }

  #load(): void {
    try {
      if (statSync(this.#path).size > 1024 * 1024) return;
      const value = fileSchema.parse(JSON.parse(readFileSync(this.#path, "utf8")));
      this.#defaultMode = value.defaultMode;
      this.#applications = new Map(Object.entries(value.applications).map(([app, mode]) => [normalizeApplication(app), mode]));
    } catch { /* Use strict defaults. */ }
  }

  #save(): void {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const value = { version: 1 as const, defaultMode: this.#defaultMode, applications: Object.fromEntries(this.#applications) };
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

export function normalizeApplication(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ").slice(0, 120);
}

function hiddenItem(item: AttentionItem): AttentionItem {
  return { ...item, title: "", body: "", contentAvailable: false };
}

export function isActionableEvidence(item: AttentionItem): boolean {
  if (item.contentAvailable === false) return false;
  if (item.title === "Notification content hidden by privacy policy") return false;
  return item.title.trim() !== "" || item.body.trim() !== "";
}
