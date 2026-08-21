import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { AttentionItem } from "./types.js";

export const attentionItemSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(80),
  app: z.string().min(1).max(120),
  title: z.string().max(2_000),
  body: z.string().max(8_000),
  category: z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/).optional(),
  intent: z.enum(["failure", "review", "deadline", "meeting", "assignment", "mention", "request", "completion", "system", "update"]).optional(),
  contentAvailable: z.boolean().optional(),
  urgency: z.enum(["low", "normal", "critical"]),
  occurredAt: z.string().datetime()
}).strict();

export class AttentionStore {
  readonly #eventsDir: string;
  readonly #seenPath: string;
  readonly #notificationClearPath: string;
  readonly #items = new Map<string, AttentionItem>();
  readonly #seen = new Set<string>();
  #notificationClearedAt = "";

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const state = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME
      : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#eventsDir = join(state, "omadigest", "events");
    this.#seenPath = join(state, "omadigest", "seen.json");
    this.#notificationClearPath = join(state, "omadigest", "notification-clear.json");
    this.#loadNotificationClear();
    this.#load();
    this.#loadSeen();
  }

  ingest(rawItems: AttentionItem[]): number {
    const items = z.array(attentionItemSchema).max(200).parse(rawItems).filter((item) =>
      item.source !== "notifications" || this.#notificationClearedAt === "" || item.occurredAt > this.#notificationClearedAt);
    if (items.length === 0) return this.#items.size;
    mkdirSync(this.#eventsDir, { recursive: true, mode: 0o700 });
    const day = new Date().toISOString().slice(0, 10);
    const path = join(this.#eventsDir, `${day}.jsonl`);
    for (const item of items) {
      if (!this.#items.has(item.id)) this.#seen.delete(item.id);
      this.#items.delete(item.id);
      this.#items.set(item.id, item);
      appendFileSync(path, `${JSON.stringify(item)}\n`, { encoding: "utf8", mode: 0o600 });
    }
    chmodSync(path, 0o600);
    this.#trimMemory();
    this.#pruneFiles();
    return this.#items.size;
  }

  recent(limit: number): AttentionItem[] {
    return [...this.#items.values()]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  pending(limit: number): AttentionItem[] {
    return [...this.#items.values()]
      .filter((item) => !this.#seen.has(item.id))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, Math.max(1, Math.min(200, limit)));
  }

  acknowledge(ids: string[]): number {
    for (const id of ids.slice(0, 500)) if (this.#items.has(id)) this.#seen.add(id);
    while (this.#seen.size > 5_000) {
      const first = this.#seen.values().next().value as string | undefined;
      if (first === undefined) break;
      this.#seen.delete(first);
    }
    this.#saveSeen();
    return this.pending(500).length;
  }

  acknowledgedIds(): string[] {
    return [...this.#items.keys()].filter((id) => this.#seen.has(id));
  }

  clearNotifications(clearedAt = new Date().toISOString()): void {
    this.#notificationClearedAt = z.string().datetime().parse(clearedAt);
    this.#saveNotificationClear();
    if (existsSync(this.#eventsDir)) {
      let names: string[] = [];
      try { names = readdirSync(this.#eventsDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name)); }
      catch { names = []; }
      for (const name of names) {
        const path = join(this.#eventsDir, name);
        try {
          if (statSync(path).size > 10 * 1024 * 1024) throw new Error("oversized attention segment");
          const retained = readFileSync(path, "utf8").split("\n").flatMap((line) => {
            if (line === "") return [];
            const item = attentionItemSchema.parse(JSON.parse(line));
            return item.source === "notifications" ? [] : [JSON.stringify(item)];
          });
          const temporary = `${path}.${randomUUID()}.tmp`;
          writeFileSync(temporary, retained.length === 0 ? "" : `${retained.join("\n")}\n`, { mode: 0o600 });
          renameSync(temporary, path);
        } catch { rmSync(path, { force: true }); }
      }
    }
    for (const [id, item] of this.#items) if (item.source === "notifications") this.#items.delete(id);
    for (const id of this.#seen) if (!this.#items.has(id)) this.#seen.delete(id);
    this.#saveSeen();
  }

  clear(): void {
    this.#items.clear();
    this.#seen.clear();
    rmSync(this.#eventsDir, { recursive: true, force: true });
    rmSync(this.#seenPath, { force: true });
    this.#notificationClearedAt = new Date().toISOString();
    this.#saveNotificationClear();
  }

  byIds(ids: string[]): AttentionItem[] {
    return ids.slice(0, 32).flatMap((id) => {
      const item = this.#items.get(id);
      return item === undefined ? [] : [item];
    });
  }

  applyPolicy(mapper: (item: AttentionItem) => AttentionItem | undefined): void {
    if (existsSync(this.#eventsDir)) {
      let names: string[] = [];
      try { names = readdirSync(this.#eventsDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name)); }
      catch { names = []; }
      for (const name of names) {
        const path = join(this.#eventsDir, name);
        try {
          if (statSync(path).size > 10 * 1024 * 1024) continue;
          const filtered = readFileSync(path, "utf8").split("\n").flatMap((line) => {
            if (line === "") return [];
            const item = attentionItemSchema.parse(JSON.parse(line));
            const presented = mapper(item);
            return presented === undefined ? [] : [JSON.stringify(presented)];
          });
          const temporary = `${path}.${randomUUID()}.tmp`;
          writeFileSync(temporary, filtered.length === 0 ? "" : `${filtered.join("\n")}\n`, { mode: 0o600 });
          renameSync(temporary, path);
        } catch { /* Leave an unreadable segment untouched rather than corrupting it. */ }
      }
    }
    const current = [...this.#items.values()];
    this.#items.clear();
    for (const item of current) {
      const presented = mapper(item);
      if (presented !== undefined) this.#items.set(presented.id, presented);
    }
  }

  #load(): void {
    if (!existsSync(this.#eventsDir)) return;
    let names: string[];
    try { names = readdirSync(this.#eventsDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name)).sort().slice(-7); }
    catch { return; }
    for (const name of names) {
      const path = join(this.#eventsDir, name);
      try {
        if (statSync(path).size > 10 * 1024 * 1024) continue;
        for (const line of readFileSync(path, "utf8").split("\n")) {
          if (line === "") continue;
          const item = attentionItemSchema.parse(JSON.parse(line));
          if (item.source === "notifications" && this.#notificationClearedAt !== "" && item.occurredAt <= this.#notificationClearedAt) continue;
          this.#items.delete(item.id);
          this.#items.set(item.id, item);
        }
      } catch { /* Skip malformed segments without losing newer ones. */ }
    }
    this.#trimMemory();
  }

  #loadSeen(): void {
    try {
      if (statSync(this.#seenPath).size > 1024 * 1024) return;
      const value: unknown = JSON.parse(readFileSync(this.#seenPath, "utf8"));
      if (!isObject(value) || value.version !== 1 || !Array.isArray(value.ids)) return;
      for (const id of value.ids.slice(-5_000)) if (typeof id === "string") this.#seen.add(id);
    } catch { /* Start with no acknowledgements. */ }
  }

  #loadNotificationClear(): void {
    try {
      if (statSync(this.#notificationClearPath).size > 64 * 1024) return;
      const value: unknown = JSON.parse(readFileSync(this.#notificationClearPath, "utf8"));
      if (isObject(value) && value.version === 1 && typeof value.clearedAt === "string")
        this.#notificationClearedAt = z.string().datetime().parse(value.clearedAt);
    } catch { /* No notification deletion watermark yet. */ }
  }

  #saveNotificationClear(): void {
    mkdirSync(dirname(this.#notificationClearPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.#notificationClearPath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, clearedAt: this.#notificationClearedAt })}\n`, { mode: 0o600 });
    renameSync(temporary, this.#notificationClearPath);
  }

  #saveSeen(): void {
    mkdirSync(dirname(this.#seenPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.#seenPath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, ids: [...this.#seen] })}\n`, { mode: 0o600 });
    renameSync(temporary, this.#seenPath);
  }

  #trimMemory(): void {
    while (this.#items.size > 500) {
      const first = this.#items.keys().next().value as string | undefined;
      if (first === undefined) break;
      this.#items.delete(first);
    }
  }

  #pruneFiles(): void {
    let names: string[];
    try { names = readdirSync(this.#eventsDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name)).sort(); }
    catch { return; }
    for (const name of names.slice(0, -7)) {
      try { rmSync(join(this.#eventsDir, name)); } catch { /* Retry on next ingest. */ }
    }
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
