import { classifyAttentionItem, groupAttentionItems } from "./intelligence.js";
import type { AttentionItem, JitAttentionContext } from "./types.js";

const MAX_JIT_WINDOW_MS = 24 * 60 * 60_000;

export function detectJitContext(items: AttentionItem[], now = new Date()): JitAttentionContext | undefined {
  const candidates = items.slice(0, 100).map(classifyAttentionItem).flatMap((item) => {
    const text = `${item.title}\n${item.body}`.toLowerCase().slice(0, 10_000);
    if (item.intent !== "meeting" && item.intent !== "deadline"
      && !/\b(?:meeting|calendar|starts?|begins?|deadline|due)\b/u.test(text)) return [];
    const due = inferredDueAt(item, now);
    if (due === undefined) return [];
    const delta = due.getTime() - now.getTime();
    if (delta < 60_000 || delta > MAX_JIT_WINDOW_MS) return [];
    const subject = groupAttentionItems([item])[0]?.subject || item.title || item.app;
    return [{ sourceId: item.id, subject, dueAt: due.toISOString(), minutesUntil: Math.max(1, Math.ceil(delta / 60_000)) }];
  }).sort((left, right) => left.minutesUntil - right.minutesUntil);
  return candidates[0];
}

export function isJitActionWindow(context: JitAttentionContext | undefined): boolean {
  return context !== undefined && context.minutesUntil <= 15;
}

function inferredDueAt(item: AttentionItem, now: Date): Date | undefined {
  const text = `${item.title}\n${item.body}`.toLowerCase().slice(0, 10_000);
  const relative = /\b(?:starts?|begins?|due|meeting|deadline)?\s*(?:in)\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b/u.exec(text);
  if (relative !== null) {
    const amount = Number(relative[1]);
    const milliseconds = /hour|hr/u.test(relative[2] ?? "") ? amount * 60 * 60_000 : amount * 60_000;
    return new Date(now.getTime() + milliseconds);
  }
  const iso = /\b(20\d{2}-\d{2}-\d{2}t\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:z|[+-]\d{2}:?\d{2}))\b/iu.exec(text);
  if (iso !== null) {
    const parsed = new Date(iso[1]!);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  const clock = /\b(?:at|starts?|begins?|due)\s+(\d{1,2}):(\d{2})(?:\s*(am|pm))?\b/u.exec(text);
  if (clock !== null) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2]);
    if (clock[3] === "pm" && hour < 12) hour += 12;
    if (clock[3] === "am" && hour === 12) hour = 0;
    const parsed = new Date(now);
    parsed.setHours(hour, minute, 0, 0);
    if (parsed.getTime() <= now.getTime()) parsed.setDate(parsed.getDate() + 1);
    return parsed;
  }
  const occurred = new Date(item.occurredAt);
  return occurred.getTime() > now.getTime() + 60_000 ? occurred : undefined;
}
