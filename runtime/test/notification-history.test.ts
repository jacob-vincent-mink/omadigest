import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readOmarchyNotificationHistory } from "../src/notification-history.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixtureRoot(): { root: string; history: string } {
  const root = mkdtempSync(join(tmpdir(), "omadigest-omarchy-history-"));
  roots.push(root);
  const history = join(root, ".local", "state", "omarchy", "notifications", "history");
  mkdirSync(history, { recursive: true });
  return { root, history };
}

describe("Omarchy notification history reader", () => {
  it("reads at most 50 bounded regular files newest first", () => {
    const { root, history } = fixtureRoot();
    for (let index = 0; index < 60; index += 1) {
      const timestamp = 1_780_000_000_000 + index;
      writeFileSync(join(history, `${timestamp}-${index}.json`), JSON.stringify({
        id: index, originalId: index, app: "GitHub", summary: `Item ${index}`, body: "Body",
        urgency: 1, timestamp
      }));
    }
    const items = readOmarchyNotificationHistory({ HOME: root });
    expect(items).toHaveLength(50);
    expect(items[0]).toMatchObject({ app: "GitHub", title: "Item 59", source: "notifications" });
    expect(items.at(-1)?.title).toBe("Item 10");
  });

  it("ignores symlinks, oversized files, and malformed rows", () => {
    const { root, history } = fixtureRoot();
    const outside = join(root, "outside.json");
    writeFileSync(outside, JSON.stringify({ app: "Spoof", summary: "Outside", body: "", urgency: 1, timestamp: 1_780_000_000_000 }));
    symlinkSync(outside, join(history, "1780000000000-1.json"));
    writeFileSync(join(history, "1780000000001-2.json"), "x".repeat(65 * 1024));
    writeFileSync(join(history, "1780000000002-3.json"), "not-json");
    expect(readOmarchyNotificationHistory({ HOME: root })).toEqual([]);
  });
});
