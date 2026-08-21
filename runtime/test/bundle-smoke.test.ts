import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_PROTOCOL_LINE_BYTES } from "../src/protocol-lines.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("checked-in broker bundle", () => {
  it("starts and publishes ready state from an isolated profile", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-bundle-smoke-"));
    roots.push(root);
    const stateRoot = join(root, "state");
    const releaseDirectory = join(stateRoot, "omadigest");
    mkdirSync(releaseDirectory, { recursive: true });
    writeFileSync(join(releaseDirectory, "release-update.json"), JSON.stringify({
      version: 1,
      checkedAt: new Date().toISOString(),
      latestVersion: "0.1.4",
      releaseUrl: "https://github.com/jacob-vincent-mink/omadigest/releases/tag/v0.1.4"
    }));

    const child = spawn(process.execPath, [resolve("runtime/dist/omadigest-broker.mjs")], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: root,
        XDG_CONFIG_HOME: join(root, "config"),
        XDG_STATE_HOME: stateRoot,
        OMADIGEST_PLUGIN_DIR: process.cwd()
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout = (stdout + String(chunk)).slice(-2 * 1024 * 1024); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-64 * 1024); });
    child.stdin.end(`${"x".repeat(MAX_PROTOCOL_LINE_BYTES + 1)}\n${JSON.stringify({ type: "initialize", protocolVersion: 2 })}\n${JSON.stringify({ type: "shutdown" })}\n`);

    const exitCode = await new Promise<number | null>((resolveExit, rejectExit) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        rejectExit(new Error("Bundled broker did not exit within 10 seconds"));
      }, 10_000);
      child.once("error", (error) => { clearTimeout(timer); rejectExit(error); });
      child.once("exit", (code) => { clearTimeout(timer); resolveExit(code); });
    });

    expect(exitCode, stderr).toBe(0);
    const events = stdout.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.find((event) => event.code === "protocol_line_too_large")).toMatchObject({
      type: "error",
      id: "protocol",
      code: "protocol_line_too_large"
    });
    expect(events.find((event) => event.type === "ready")).toMatchObject({
      type: "ready",
      protocolVersion: 2,
      privacy: { defaultMode: "count-only" }
    });
  }, 15_000);
});
