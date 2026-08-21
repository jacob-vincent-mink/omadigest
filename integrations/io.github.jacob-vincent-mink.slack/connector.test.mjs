import test from "node:test";
import assert from "node:assert/strict";
import { parseSlackData, requestedCategories, syncSlack } from "./connector.mjs";

test("classifies visible DMs, mentions, and actual thread replies", () => {
  const data = { userId: "UME", histories: [
    { channel: { id: "D1", is_im: true }, data: { messages: [{ ts: "1787241600.000001", user: "U1", text: "hello" }] } },
    { channel: { id: "C1", name: "team", is_member: true }, data: { messages: [{ ts: "1787241660.000001", user: "U2", text: "ping <@UME>" }] } }
  ], replySets: [{ channel: { id: "C1", name: "team" }, parentTs: "1787241700.000001", data: { messages: [
    { ts: "1787241700.000001", user: "U2", text: "parent" }, { ts: "1787241760.000001", user: "U3", text: "reply" }
  ] } }] };
  const items = parseSlackData(data, "2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z", 50);
  assert.deepEqual(new Set(items.map((item) => item.category)), new Set(["direct-messages", "mentions", "thread-replies"]));
  assert.ok(items.every((item) => item.id.startsWith("slack:") && !item.url));
});

test("drops self-authored, malformed, and out-of-window messages", () => {
  const histories = [{ channel: { id: "D1", is_im: true }, data: { messages: [
    { ts: "1787241600.1", user: "UME", text: "self" }, { ts: "bad", user: "U1", text: "bad" }
  ] } }];
  assert.deepEqual(parseSlackData({ userId: "UME", histories, replySets: [] }, "2026-08-20", "2026-08-21"), []);
});

test("disabled categories are not emitted and thread calls are skipped", async () => {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = new URL(input); calls.push(url);
    const method = url.pathname.split("/").at(-1);
    if (method === "auth.test") return new Response(JSON.stringify({ ok: true, user_id: "UME" }));
    if (method === "conversations.list") return new Response(JSON.stringify({ ok: true, channels: [{ id: "D1", is_im: true }] }));
    if (method === "conversations.history") return new Response(JSON.stringify({ ok: true, messages: [{ ts: "1787241600.000001", user: "U1", text: "hello", reply_count: 2 }] }));
    throw new Error(`unexpected ${method}`);
  };
  const items = await syncSlack({ since: "2026-08-20", until: "2026-08-21", limit: 50 }, { token: "test", maxConversations: 8 }, requestedCategories({ categories: ["direct-messages", "unknown"] }), fetchImpl);
  assert.deepEqual(items.map((item) => item.category), ["direct-messages"]);
  assert.equal(calls.some((url) => url.pathname.endsWith("conversations.replies")), false);
  assert.equal(calls.find((url) => url.pathname.endsWith("conversations.list")).searchParams.get("types"), "mpim,im");
  calls.length = 0;
  assert.deepEqual(await syncSlack({}, { token: "test", maxConversations: 8 }, requestedCategories({ categories: [] }), fetchImpl), []);
  assert.equal(calls.length, 0);
});

test("manifest documents three bounded categories", async () => { const { readFile } = await import("node:fs/promises"); const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8")); assert.equal(manifest.categories.length, 3); });
