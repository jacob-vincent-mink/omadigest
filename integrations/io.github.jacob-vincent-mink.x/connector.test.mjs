import test from "node:test";
import assert from "node:assert/strict";
import { parsePosts } from "./connector.mjs";

test("classifies bounded mentions and selected account activity", () => {
  const items = parsePosts({
    data: [
      { id: "11", author_id: "a", created_at: "2026-08-20T12:00:00Z", text: "Hello @owner" },
      { id: "12", author_id: "b", created_at: "2026-08-20T13:00:00Z", text: "A release update" },
      { id: "13", author_id: "c", created_at: "2026-08-20T14:00:00Z", text: "Unrelated" }
    ],
    includes: { users: [{ id: "a", username: "person" }, { id: "b", username: "news" }, { id: "c", username: "other" }] }
  }, "owner", ["news"], "2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z", 10);
  assert.deepEqual(items.map(({ id, category, url }) => ({ id, category, url })), [
    { id: "x:post:12", category: "account-activity", url: "https://x.com/news/status/12" },
    { id: "x:post:11", category: "mentions", url: "https://x.com/person/status/11" }
  ]);
});

test("drops malformed and out-of-window posts", () => {
  assert.deepEqual(parsePosts({ data: [
    { id: "old", author_id: "a", created_at: "2020-01-01T00:00:00Z", text: "@owner old" },
    { id: "bad", author_id: "a", created_at: "bad", text: "@owner bad" }
  ], includes: { users: [{ id: "a", username: "safe_name" }] } }, "owner", [], "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z"), []);
});

test("manifest declares bounded categories", async () => {
  const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("./manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.categories.length, 2);
  assert.ok(manifest.categories.every((entry) => typeof entry.defaultEnabled === "boolean"));
});
