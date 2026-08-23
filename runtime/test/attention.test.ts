import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
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

  it("does not append identical snapshot records repeatedly", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-attention-disk-dedupe-"));
    roots.push(root);
    const attention = new AttentionStore({ XDG_STATE_HOME: root, HOME: root });
    const item = {
      id: "notification:stable", source: "notifications", app: "GitHub", title: "Stable", body: "",
      urgency: "normal" as const, occurredAt: "2026-08-20T10:00:00.000Z"
    };
    for (let index = 0; index < 20; index += 1) attention.ingest([item]);
    const events = join(root, "omadigest", "events");
    const segment = join(events, readdirSync(events)[0]!);
    expect(readFileSync(segment, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("reports only changed source IDs so wakeups can be coalesced", () => {
    const attention = store();
    const item = {
      id: "notification:stable", source: "notifications", app: "GitHub", title: "Review requested", body: "PR #42",
      urgency: "normal" as const, occurredAt: "2026-08-20T10:00:00.000Z"
    };
    expect(attention.ingestWithResult([item]).changedIds).toEqual([item.id]);
    expect(attention.ingestWithResult([item]).changedIds).toEqual([]);
    expect(attention.ingestWithResult([{ ...item, body: "PR #42 approved" }]).changedIds).toEqual([item.id]);
  });

  it("compacts attention persistence below the hard segment byte limit", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-attention-budget-"));
    roots.push(root);
    const attention = new AttentionStore({ XDG_STATE_HOME: root, HOME: root });
    for (let batch = 0; batch < 3; batch += 1) {
      attention.ingest(Array.from({ length: 200 }, (_, index) => ({
        id: `source:${batch}:${index}`, source: "source", app: "Source", title: `Item ${batch}-${index}`,
        body: "x".repeat(8_000), urgency: "normal" as const,
        occurredAt: new Date(Date.UTC(2026, 7, 20, 10, batch, index % 60)).toISOString()
      })));
    }
    const events = join(root, "omadigest", "events");
    for (const name of readdirSync(events)) expect(statSync(join(events, name)).size).toBeLessThanOrEqual(2 * 1024 * 1024);
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

  it("acknowledges pending items without deleting retained evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-attention-seen-"));
    roots.push(root);
    const env = { XDG_STATE_HOME: root, HOME: root };
    const attention = new AttentionStore(env);
    attention.ingest([
      { id: "crash", source: "notifications", app: "Omarchy", title: "Process crashed", body: "nvim", urgency: "critical", occurredAt: "2026-08-20T11:00:00.000Z" }
    ]);
    expect(attention.pending(10)).toHaveLength(1);
    attention.acknowledge(["crash"]);
    expect(attention.pending(10)).toEqual([]);
    expect(attention.byIds(["crash"])[0]?.body).toBe("nvim");
    expect(new AttentionStore(env).acknowledgedIds()).toEqual(["crash"]);
  });

  it("deletes only retained notification evidence and blocks older re-imports", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-attention-clear-"));
    roots.push(root);
    const env = { XDG_STATE_HOME: root, HOME: root };
    const attention = new AttentionStore(env);
    attention.ingest([
      { id: "notification:old", source: "notifications", app: "GitHub", title: "Old", body: "", urgency: "normal", occurredAt: "2026-08-20T10:00:00.000Z" },
      { id: "connector:old", source: "calendar", app: "Calendar", title: "Event", body: "", urgency: "normal", occurredAt: "2026-08-20T10:00:00.000Z" }
    ]);
    attention.clearNotifications("2026-08-20T11:00:00.000Z");
    expect(attention.recent(10).map((item) => item.id)).toEqual(["connector:old"]);

    attention.ingest([
      { id: "notification:replayed", source: "notifications", app: "GitHub", title: "Replayed", body: "", urgency: "normal", occurredAt: "2026-08-20T10:30:00.000Z" },
      { id: "notification:new", source: "notifications", app: "GitHub", title: "New", body: "", urgency: "normal", occurredAt: "2026-08-20T11:30:00.000Z" }
    ]);
    expect(attention.recent(10).map((item) => item.id).sort()).toEqual(["connector:old", "notification:new"]);
    expect(new AttentionStore(env).recent(10).map((item) => item.id).sort()).toEqual(["connector:old", "notification:new"]);
  });
});
