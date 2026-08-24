import { describe, expect, it } from "vitest";
import {
  canonicalAttentionItem,
  collateRecentConversationEvidence,
  conversationThreadKey
} from "../src/conversation.js";
import type { AttentionItem, Digest } from "../src/types.js";

const item = (id: string, occurredAt: string, overrides: Partial<AttentionItem> = {}): AttentionItem => ({
  id, source: "notifications", app: "Signal", title: "Ada Lovelace", body: "A message",
  urgency: "normal", occurredAt, ...overrides
});

const digest = (id: string, sourceIds: string[], overrides: Partial<Digest> = {}): Digest => ({
  id, templateId: "general", title: "Conversation", generatedAt: "2026-08-24T12:05:00.000Z",
  sections: [{ title: "Messages", entries: [{
    headline: "Ada followed up", explanation: "A short update", importance: "normal", confidence: 1, sourceIds
  }] }], ...overrides
});

describe("conversation collation", () => {
  it("canonicalizes the same live and history notification identity", () => {
    const live = canonicalAttentionItem(item("notification:1787574653874:1", "2026-08-24T12:30:53.874Z"));
    const history = canonicalAttentionItem(item("notification:1787574653874-1", "2026-08-24T12:30:53.874Z"));
    expect(live.id).toBe(history.id);
  });

  it("groups known chat notifications by application and short conversation title", () => {
    const first = item("one", "2026-08-24T12:00:00.000Z");
    const second = item("two", "2026-08-24T12:01:00.000Z", { body: "Another message" });
    expect(conversationThreadKey(first)).toBe(conversationThreadKey(second));
    expect(conversationThreadKey({ ...first, app: "GitHub" })).toBeUndefined();
    expect(conversationThreadKey({ ...first, title: "New message" })).toBeUndefined();
  });

  it("refreshes one unread conversation digest with retained thread evidence", () => {
    const old = item("old", "2026-08-24T12:00:00.000Z");
    const current = item("current", "2026-08-24T12:09:00.000Z");
    const result = collateRecentConversationEvidence([current], [digest("old-digest", [old.id])],
      (ids) => ids.includes(old.id) ? [old] : [], 20, new Date("2026-08-24T12:10:00.000Z"));
    expect(result.items.map((entry) => entry.id)).toEqual([old.id, current.id]);
    expect(result.replacedDigestIds).toEqual(["old-digest"]);
  });

  it("uses a short TTL for read threads and never absorbs mixed-source digests", () => {
    const old = item("old", "2026-08-24T12:00:00.000Z");
    const other = { ...item("other", "2026-08-24T12:01:00.000Z"), app: "GitHub", title: "PR #42" };
    const current = item("current", "2026-08-24T12:30:00.000Z");
    const read = digest("read", [old.id], { readAt: "2026-08-24T12:10:00.000Z" });
    const mixed = digest("mixed", [old.id, other.id]);
    const result = collateRecentConversationEvidence([current], [read, mixed],
      (ids) => ids.flatMap((id) => id === old.id ? [old] : id === other.id ? [other] : []),
      20, new Date("2026-08-24T12:30:00.000Z"));
    expect(result.items.map((entry) => entry.id)).toEqual([current.id]);
    expect(result.replacedDigestIds).toEqual([]);
  });
});
