import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { DigestTemplate } from "./types.js";

const MAX_STATE_BYTES = 64 * 1024;
const MAX_HIDDEN_TEMPLATES = 256;
export const templateIdSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
const stateSchema = z.object({
  version: z.literal(1),
  hidden: z.array(templateIdSchema).max(MAX_HIDDEN_TEMPLATES)
}).strict();

export class TemplateVisibilityStore {
  readonly #path: string;
  #hidden = new Set<string>();

  constructor(configRoot: string) {
    this.#path = join(configRoot, "template-state.json");
    this.reload();
  }

  reload(): void {
    this.#hidden.clear();
    try {
      if (statSync(this.#path).size > MAX_STATE_BYTES) return;
      const state = stateSchema.parse(JSON.parse(readFileSync(this.#path, "utf8")));
      this.#hidden = new Set(state.hidden);
    } catch { /* Missing or invalid state reveals packaged defaults. */ }
  }

  hidden(): Set<string> { return new Set(this.#hidden); }

  hide(id: string): void {
    const safeId = templateIdSchema.parse(id);
    this.#hidden.delete(safeId);
    this.#hidden.add(safeId);
    while (this.#hidden.size > MAX_HIDDEN_TEMPLATES) {
      const oldest = this.#hidden.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#hidden.delete(oldest);
    }
    this.#save();
  }

  show(id: string): void {
    const safeId = templateIdSchema.parse(id);
    if (!this.#hidden.delete(safeId)) return;
    this.#save();
  }

  clear(): void {
    this.#hidden.clear();
    rmSync(this.#path, { force: true });
  }

  #save(): void {
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const value = { version: 1 as const, hidden: [...this.#hidden].sort() };
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }
}

export function mergeVisibleTemplates(
  bundled: DigestTemplate[],
  user: DigestTemplate[],
  hidden: Set<string>
): DigestTemplate[] {
  const userIds = new Set(user.map((template) => template.manifest.id));
  const byId = new Map(bundled.map((template) => [template.manifest.id, template]));
  for (const template of user) byId.set(template.manifest.id, template);
  for (const id of hidden) if (!userIds.has(id)) byId.delete(id);
  return [...byId.values()].sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}
