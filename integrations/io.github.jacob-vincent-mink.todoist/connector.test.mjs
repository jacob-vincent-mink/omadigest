import test from "node:test";
import assert from "node:assert/strict";
import { parseTodoistData } from "./connector.mjs";

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

test("manifest declares four bounded categories", async () => { const { readFile } = await import("node:fs/promises"); const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8")); assert.equal(manifest.categories.length, 4); });
