import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, vi } from "vitest";
import { compareVersions, ReleaseUpdateService } from "../src/release-update.js";

describe("release update service", () => {
  test("compares stable semantic versions", () => {
    expect(compareVersions("v0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("0.1.0", "v0.1.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
  });

  test("checks a fixed GitHub endpoint and persists one bounded release", async () => {
    const path = statePath();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("https://api.github.com/repos/jacob-vincent-mink/omadigest/releases/latest");
      return Response.json({ tag_name: "v0.2.0", draft: false, prerelease: false }, { headers: { etag: '"release-2"' } });
    });
    const service = new ReleaseUpdateService("0.1.0", {
      statePath: path, fetch: fetchMock as typeof fetch, now: () => new Date("2026-08-21T12:00:00.000Z")
    });
    const status = await service.check();
    expect(status).toMatchObject({ state: "available", latestVersion: "0.2.0", dismissed: false });
    expect(status.releaseUrl).toBe("https://github.com/jacob-vincent-mink/omadigest/releases/tag/v0.2.0");
    expect(readFileSync(path, "utf8").length).toBeLessThan(64 * 1_024);
    expect(service.dismiss()).toMatchObject({ state: "available", dismissed: true });
  });

  test("uses the daily cache unless the user explicitly checks", async () => {
    const fetchMock = vi.fn(async () => Response.json({ tag_name: "v0.1.0", draft: false, prerelease: false }));
    const service = new ReleaseUpdateService("0.1.0", {
      statePath: statePath(), fetch: fetchMock as typeof fetch, now: () => new Date("2026-08-21T12:00:00.000Z")
    });
    await service.check();
    await service.check();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await service.check(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("rejects oversized or malformed release evidence without surfacing its content", async () => {
    const oversized = JSON.stringify({ tag_name: "v9.9.9", draft: false, prerelease: false, padding: "x".repeat(70_000) });
    const service = new ReleaseUpdateService("0.1.0", {
      statePath: statePath(),
      fetch: (async () => new Response(oversized)) as typeof fetch,
      now: () => new Date("2026-08-21T12:00:00.000Z")
    });
    expect(await service.check()).toEqual({
      state: "unknown", currentVersion: "0.1.0", dismissed: false,
      message: "Couldn’t check for updates right now."
    });
  });
});

function statePath(): string { return join(mkdtempSync(join(tmpdir(), "omadigest-update-")), "release-update.json"); }
