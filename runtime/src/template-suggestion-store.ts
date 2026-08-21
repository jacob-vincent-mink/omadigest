import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";

const fileSchema = z.object({
  version: z.literal(1),
  dismissed: z.array(z.object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    until: z.string().datetime()
  }).strict()).max(32)
}).strict();

export class TemplateSuggestionStore {
  readonly #path: string;
  #dismissed = new Map<string, string>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const state = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#path = join(state, "omadigest", "template-suggestions.json");
    this.#load();
  }

  active(now = new Date()): ReadonlySet<string> {
    const active = new Set<string>();
    for (const [id, until] of this.#dismissed) if (Date.parse(until) > now.getTime()) active.add(id);
    return active;
  }

  dismiss(id: string, now = new Date()): void {
    const safeId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).parse(id);
    this.#dismissed.delete(safeId);
    this.#dismissed.set(safeId, new Date(now.getTime() + 30 * 86_400_000).toISOString());
    while (this.#dismissed.size > 32) this.#dismissed.delete(this.#dismissed.keys().next().value as string);
    this.#save(now);
  }

  clear(): void {
    this.#dismissed.clear();
    this.#save(new Date());
  }

  #load(): void {
    try {
      if (!existsSync(this.#path) || statSync(this.#path).size > 64 * 1024) return;
      const value = fileSchema.parse(JSON.parse(readFileSync(this.#path, "utf8")));
      this.#dismissed = new Map(value.dismissed.map((entry) => [entry.id, entry.until]));
    } catch { /* Start with no dismissed suggestions. */ }
  }

  #save(now: Date): void {
    const dismissed = [...this.#dismissed.entries()]
      .filter(([, until]) => Date.parse(until) > now.getTime())
      .slice(-32).map(([id, until]) => ({ id, until }));
    this.#dismissed = new Map(dismissed.map((entry) => [entry.id, entry.until]));
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify({ version: 1, dismissed }, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}
