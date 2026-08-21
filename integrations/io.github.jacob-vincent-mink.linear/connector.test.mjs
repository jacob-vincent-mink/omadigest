import test from "node:test";
import assert from "node:assert/strict";
import { parseLinearData } from "./connector.mjs";

const payload = { viewer: { id: "me", name: "Jacob", assignedIssues: { nodes: [{
  id: "issue-1", identifier: "ENG-42", title: "Bound the connector", url: "https://linear.app/acme/issue/ENG-42/x?secret=no",
  updatedAt: "2026-08-20T10:00:00Z", dueDate: "2026-08-19", state: { name: "In Progress", type: "started" },
  comments: { nodes: [
    { id: "comment-1", body: "@Jacob please review", createdAt: "2026-08-20T11:00:00Z", user: { id: "other", name: "Sam" } },
    { id: "comment-own", body: "my note", createdAt: "2026-08-20T12:00:00Z", user: { id: "me", name: "Jacob" } }
  ] },
  history: { nodes: [{ id: "history-1", createdAt: "2026-08-20T09:00:00Z", fromState: { name: "Todo" }, toState: { name: "In Progress" } }] }
}] } } };

test("emits assigned, comment, state, and overdue categories with stable ids", () => {
  const items = parseLinearData(payload, "2026-08-20T00:00:00Z", "2026-08-21T00:00:00Z", 50, new Date("2026-08-20T12:00:00Z"));
  assert.deepEqual(new Set(items.map((item) => item.category)), new Set(["assigned-issues", "mentions-comments", "state-changes", "due-work"]));
  assert.ok(items.every((item) => item.id.startsWith("linear:") && !item.url?.includes("secret")));
  assert.equal(items.find((item) => item.category === "mentions-comments").body, "Sam: @Jacob please review");
});

test("drops malformed issues and out-of-window activity", () => {
  assert.deepEqual(parseLinearData({ viewer: { assignedIssues: { nodes: [{ id: "x", title: "missing fields" }] } } }, "2026-01-01", "2026-01-02"), []);
});

test("manifest declares four bounded categories", async () => {
  const { readFile } = await import("node:fs/promises"); const manifest = JSON.parse(await readFile(new URL("./manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.categories.length, 4);
});
