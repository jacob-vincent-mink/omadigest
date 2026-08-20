import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { AttentionItem } from "./types.js";

export const attentionItemSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(80),
  app: z.string().min(1).max(120),
  title: z.string().max(2_000),
  body: z.string().max(8_000),
  urgency: z.enum(["low", "normal", "critical"]),
  occurredAt: z.string().datetime()
}).strict();

export class AttentionStore {
  readonly #eventsDir: string;
  readonly #items = new Map<string, AttentionItem>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const state = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME
      : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#eventsDir = join(state, "omadigest", "events");
    this.#load();
  }

  ingest(rawItems: AttentionItem[]): number {
    const items = z.array(attentionItemSchema).max(200).parse(rawItems);
    if (items.length === 0) return this.#items.size;
    mkdirSync(this.#eventsDir, { recursive: true, mode: 0o700 });
    const day = new Date().toISOString().slice(0, 10);
    const path = join(this.#eventsDir, `${day}.jsonl`);
    for (const item of items) {
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
          this.#items.delete(item.id);
          this.#items.set(item.id, item);
        }
      } catch { /* Skip malformed segments without losing newer ones. */ }
    }
    this.#trimMemory();
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
