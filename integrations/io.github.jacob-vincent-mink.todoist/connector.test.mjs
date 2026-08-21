import test from "node:test";
import assert from "node:assert/strict";
import { parseTodoistData, requestedCategories, syncTodoist } from "./connector.mjs";

test("classifies overdue, upcoming, assigned, and completed tasks", () => {
  const data = {
    due: { results: [
      { id: "old", content: "Old task", due: { date: "2026-08-19" }, updated_at: "2026-08-20T08:00:00Z" },
      { id: "soon", content: "Soon task", due: { date: "2026-08-23" }, updated_at: "2026-08-20T09:00:00Z" }
    ] },
    assigned: { results: [{ id: "assigned", content: "Review work", added_at: "2026-08-20T10:00:00Z" }] },
    completed: { items: [{ id: "done", content: "Finished", completed_at: "2026-08-20T11:00:00Z" }] }
  };
  const items = parseTodoistData(data, "2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z", 50, new Date("2026-08-20T12:00:00Z"));
  assert.deepEqual(new Set(items.map((item) => item.category)), new Set(["overdue", "today-upcoming", "assigned", "completed-activity"]));
  assert.ok(items.every((item) => item.url.startsWith("https://app.todoist.com/app/task/")));
});

test("bounds output and rejects malformed completed activity", () => {
  const assigned = { results: Array.from({ length: 80 }, (_, index) => ({ id: String(index), content: `Task ${index}`, added_at: "2026-08-20T10:00:00Z" })) };
  const items = parseTodoistData({ due: {}, assigned, completed: { items: [{ id: "bad", content: "bad", completed_at: "invalid" }] } }, undefined, undefined, 10);
  assert.equal(items.length, 10); assert.ok(items.every((item) => item.category === "assigned"));
});

test("disabled categories are not emitted and their endpoints are skipped", async () => {
  const calls = [];
  const fetchImpl = async (input) => { const url = new URL(input); calls.push(url); return new Response(JSON.stringify({ results: [{ id: "assigned", content: "Review", added_at: "2026-08-20T10:00:00Z" }] })); };
  const items = await syncTodoist({ since: "2026-08-20", until: "2026-08-21", limit: 50 }, "test", requestedCategories({ categories: ["assigned", "unknown"] }), fetchImpl);
  assert.deepEqual(items.map((item) => item.category), ["assigned"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get("query"), "assigned to: me");
  assert.equal(calls.some((url) => url.pathname.includes("completed")), false);
  calls.length = 0;
  await syncTodoist({ limit: 50 }, "test", requestedCategories({ categories: ["overdue"] }), fetchImpl);
  assert.equal(calls[0].searchParams.get("query"), "overdue");
  calls.length = 0;
  assert.deepEqual(await syncTodoist({}, "test", requestedCategories({ categories: [] }), fetchImpl), []);
  assert.equal(calls.length, 0);
});

test("manifest declares four bounded categories", async () => { const { readFile } = await import("node:fs/promises"); const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8")); assert.equal(manifest.categories.length, 4); });
