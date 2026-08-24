import { createHash } from "node:crypto";
import type { AttentionItem, Digest } from "./types.js";

export const CONVERSATION_QUIET_MS = 5 * 60_000;
export const UNREAD_CONVERSATION_COLLATION_MS = 60 * 60_000;
export const READ_CONVERSATION_COLLATION_MS = 15 * 60_000;

const CHAT_APPLICATIONS = new Set([
  "signal", "slack", "discord", "telegram", "whatsapp", "element", "matrix",
  "mattermost", "microsoft teams", "teams", "messages", "google chat"
]);

export function canonicalAttentionItem(item: AttentionItem): AttentionItem {
  if (item.source !== "notifications") return item;
  const id = canonicalAttentionId(item.id);
  return id === item.id ? item : { ...item, id };
}

export function canonicalAttentionId(id: string): string {
  const match = /^notification:(\d{10,20})[:-](\d{1,20})$/u.exec(id);
  return match === null ? id : `notification:${match[1]}-${match[2]}`;
}

export function conversationThreadKey(item: AttentionItem): string | undefined {
  if (item.source !== "notifications" || item.contentAvailable === false) return undefined;
  const app = normalize(item.app);
  const category = normalize(item.category ?? "");
  if (!CHAT_APPLICATIONS.has(app) && !/(?:direct message|thread reply|chat message)/u.test(category)) return undefined;
  const title = normalizeConversationTitle(item.title);
  if (title === "" || /^(?:new )?(?:message|notification|activity|chat)s?$/u.test(title)) return undefined;
  return `conversation-${createHash("sha256").update(`${app}\u0000${title}`).digest("hex").slice(0, 24)}`;
}

export function conversationSubject(item: AttentionItem): string {
  return item.title.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replaceAll(/\s+/gu, " ").trim().slice(0, 120)
    || item.app.slice(0, 120);
}

export function collateRecentConversationEvidence(
  incoming: AttentionItem[],
  digests: Digest[],
  resolveEvidence: (ids: string[]) => AttentionItem[],
  maximumItems: number,
  now = new Date()
): { items: AttentionItem[]; replacedDigestIds: string[] } {
  const incomingKeys = new Set(incoming.flatMap((item) => {
    const key = conversationThreadKey(item);
    return key === undefined ? [] : [key];
  }));
  if (incomingKeys.size === 0) return { items: boundedNewest(incoming, maximumItems), replacedDigestIds: [] };

  const retained = [...incoming];
  const replacedDigestIds: string[] = [];
  for (const digest of digests.slice(0, 30)) {
    if (digest.feedback !== undefined || !isWithinCollationWindow(digest, now)) continue;
    const ids = [...new Set(digest.sections.flatMap((section) =>
      section.entries.flatMap((entry) => entry.sourceIds)))].slice(0, 100);
    if (ids.length === 0) continue;
    const evidence = resolveEvidence(ids);
    if (evidence.length !== ids.length) continue;
    const keys = evidence.map(conversationThreadKey);
    if (keys.some((key) => key === undefined || !incomingKeys.has(key))) continue;
    retained.push(...evidence);
    replacedDigestIds.push(digest.id);
  }
  return {
    items: boundedNewest(retained, maximumItems),
    replacedDigestIds: [...new Set(replacedDigestIds)].slice(0, 8)
  };
}

function isWithinCollationWindow(digest: Digest, now: Date): boolean {
  const anchor = Date.parse(digest.readAt ?? digest.generatedAt);
  if (!Number.isFinite(anchor)) return false;
  const elapsed = now.getTime() - anchor;
  if (elapsed < 0) return false;
  return elapsed <= (digest.readAt === undefined
    ? UNREAD_CONVERSATION_COLLATION_MS : READ_CONVERSATION_COLLATION_MS);
}

function boundedNewest(items: AttentionItem[], maximumItems: number): AttentionItem[] {
  const byId = new Map<string, AttentionItem>();
  for (const item of items.slice(0, 200)) byId.set(item.id, item);
  return [...byId.values()]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, Math.max(1, Math.min(100, maximumItems)))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function normalize(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, " ").trim().replaceAll(/\s+/gu, " ").slice(0, 160);
}

function normalizeConversationTitle(value: string): string {
  return normalize(value)
    .replace(/\s+\d+\s+(?:new\s+)?messages?$/u, "")
    .replace(/\s+sent\s+(?:you\s+)?a\s+message$/u, "")
    .trim();
}
