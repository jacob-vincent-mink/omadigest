import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AttentionStore } from "../src/attention.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function store(): AttentionStore {
  const root = mkdtempSync(join(tmpdir(), "omadigest-attention-"));
  roots.push(root);
  return new AttentionStore({ XDG_STATE_HOME: root, HOME: root });
}

describe("AttentionStore", () => {
  it("deduplicates updates by stable source ID", () => {
    const attention = store();
    const base = {
      id: "notification:1", source: "notifications", app: "GitHub", body: "",
      urgency: "normal" as const, occurredAt: "2026-08-20T10:00:00.000Z"
    };
    attention.ingest([{ ...base, title: "First" }, { ...base, title: "Updated" }]);
    expect(attention.recent(10)).toHaveLength(1);
    expect(attention.recent(10)[0]?.title).toBe("Updated");
  });

  it("returns newest items first", () => {
    const attention = store();
    attention.ingest([
      { id: "1", source: "x", app: "X", title: "Old", body: "", urgency: "low", occurredAt: "2026-08-20T09:00:00.000Z" },
      { id: "2", source: "x", app: "X", title: "New", body: "", urgency: "critical", occurredAt: "2026-08-20T11:00:00.000Z" }
    ]);
    expect(attention.recent(1)[0]?.title).toBe("New");
    expect(attention.byIds(["1", "missing", "2"]).map((item) => item.title)).toEqual(["Old", "New"]);
  });
});
