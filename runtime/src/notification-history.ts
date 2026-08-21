import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import type { AttentionItem } from "./types.js";

const MAX_HISTORY_FILES = 50;
const MAX_HISTORY_FILE_BYTES = 64 * 1024;
const MAX_HISTORY_TOTAL_BYTES = 512 * 1024;

const historyEntrySchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  originalId: z.union([z.string(), z.number()]).optional(),
  app: z.string().max(500).optional(),
  summary: z.string().max(20_000).optional(),
  body: z.string().max(80_000).optional(),
  urgency: z.number().optional(),
  timestamp: z.number().finite().positive()
}).passthrough();

export function readOmarchyNotificationHistory(env: NodeJS.ProcessEnv = process.env): AttentionItem[] {
  const home = env.HOME?.startsWith("/") ? env.HOME : undefined;
  if (home === undefined) return [];
  const directory = join(home, ".local", "state", "omarchy", "notifications", "history");
  try {
    const directoryStat = lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) return [];
  } catch { return []; }

  let names: string[];
  try {
    names = readdirSync(directory)
      .filter((name) => /^\d{1,20}-\d{1,20}\.json$/u.test(name))
      .sort((left, right) => right.localeCompare(left))
      .slice(0, MAX_HISTORY_FILES);
  } catch { return []; }

  const items: AttentionItem[] = [];
  let totalBytes = 0;
  for (const name of names) {
    const path = join(directory, name);
    try {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_HISTORY_FILE_BYTES) continue;
      if (totalBytes + stat.size > MAX_HISTORY_TOTAL_BYTES) break;
      totalBytes += stat.size;
      const parsed = historyEntrySchema.parse(JSON.parse(readFileSync(path, "utf8")));
      const occurredAt = new Date(parsed.timestamp).toISOString();
      const app = boundedText(parsed.app || "unknown", 120);
      const urgency = Number(parsed.urgency ?? 1);
      items.push({
        id: `notification:${basename(name, ".json")}`.slice(0, 200),
        source: "notifications",
        app,
        title: boundedText(parsed.summary || "", 2_000),
        body: boundedText(parsed.body || "", 8_000),
        urgency: urgency >= 2 ? "critical" : urgency <= 0 ? "low" : "normal",
        occurredAt
      });
    } catch { /* Skip malformed, replaced, or unreadable entries. */ }
  }
  return items;
}

function boundedText(value: string, maximum: number): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, " ").slice(0, maximum);
}
