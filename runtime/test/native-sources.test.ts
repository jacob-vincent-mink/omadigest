import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NativeSourceStore,
  deriveTelemetryEvents,
  parseCoredumps,
  parseFailedServices,
  parseOmarchyUpdates,
  parsePowerSupplies,
  storageWarning,
  type NativeSourceItem
} from "../src/native-sources.js";

describe("native sources", () => {
  it("normalizes bounded coredump metadata without exposing core contents", () => {
    const raw = JSON.stringify([
      { time: 1_787_268_000_000_000, pid: 42, sig: 11, exe: "/usr/bin/example" },
      { time: "invalid", pid: 7, sig: 6, exe: "/tmp/ignored" }
    ]);
    const items = parseCoredumps(raw, new Date("2026-08-20T00:00:00Z"), new Date("2026-08-21T00:00:00Z"));
    expect(items).toHaveLength(1);
    expect(items[0]!).toMatchObject({ category: "application-crashes", title: "example crashed", body: "SIGSEGV · PID 42" });
    expect(JSON.stringify(items)).not.toContain("/usr/bin");
  });

  it("treats only exit zero update output as an available update", () => {
    expect(parseOmarchyUpdates("Omarchy is up to date\n", 1, new Date("2026-08-20T12:00:00Z"))).toEqual([]);
    const items = parseOmarchyUpdates("omarchy 3.1.0 -> 3.2.0\n", 0, new Date("2026-08-20T12:00:00Z"));
    expect(items[0]).toMatchObject({ title: "Omarchy update available", category: "available-updates" });
  });

  it("derives charger and battery threshold events only from transitions", () => {
    const events = deriveTelemetryEvents(
      { capturedAt: "2026-08-20T10:00:00Z", onBattery: false, batteryPercent: 48, networkState: "full" },
      { capturedAt: "2026-08-20T10:05:00Z", onBattery: true, batteryPercent: 19, networkState: "none" }
    );
    expect(events.map((item) => item.category)).toEqual(["power", "battery", "network"]);
    expect(events[0]!.title).toBe("Charger disconnected");
  });

  it("summarizes multiple batteries and charger state", () => {
    expect(parsePowerSupplies([
      { type: "Mains", online: "1", capacity: "", status: "" },
      { type: "Battery", online: "", capacity: "60", status: "Charging" },
      { type: "Battery", online: "", capacity: "40", status: "Charging" }
    ])).toEqual({ onBattery: false, batteryPercent: 50, batteryState: "charging" });
  });

  it("only exposes valid failed unit names", () => {
    const items = parseFailedServices("backup.service loaded failed failed Backup secrets\nnot a valid row\n", new Date("2026-08-20T12:00:00Z"));
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("backup.service failed");
    expect(JSON.stringify(items)).not.toContain("Backup secrets");
  });

  it("emits bounded storage warnings at defined thresholds", () => {
    expect(storageWarning({ total: 100, available: 16 }, new Date())).toEqual([]);
    expect(storageWarning({ total: 100, available: 15 }, new Date())[0]!.title).toBe("Storage running low");
    expect(storageWarning({ total: 100, available: 5 }, new Date())[0]).toMatchObject({ title: "Storage critically low", urgency: "critical" });
  });

  it("bounds and expires persisted telemetry events", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-native-"));
    const store = new NativeSourceStore(root);
    const now = new Date("2026-08-20T12:00:00Z");
    const event = (index: number, occurredAt: string): NativeSourceItem => ({
      id: `event-${index}`, source: "io.omarchy.system-telemetry", category: "power", app: "System Telemetry",
      title: "Power changed", body: "Bounded detail", urgency: "normal", occurredAt
    });
    store.write({
      version: 1,
      snapshot: { capturedAt: now.toISOString(), onBattery: true },
      events: [event(0, "2026-08-01T00:00:00Z"), ...Array.from({ length: 300 }, (_, index) => event(index + 1, now.toISOString()))]
    }, now);
    const loaded = store.read(now);
    expect(loaded.events).toHaveLength(256);
    expect(loaded.events.some((item) => item.id === "event-0")).toBe(false);
    expect(readFileSync(join(root, "native-source-state.json"), "utf8").length).toBeLessThan(256 * 1024);
  });

  it("rejects oversized persisted state on read", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-native-large-"));
    writeFileSync(join(root, "native-source-state.json"), "x".repeat(256 * 1024 + 1));
    expect(new NativeSourceStore(root).read().events).toEqual([]);
  });
});
