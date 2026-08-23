import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      latestVersion: "0.1.5",
      releaseUrl: "https://github.com/jacob-vincent-mink/omadigest/releases/tag/v0.1.5"
    }));
    const watchId = "0fb3735a-54b1-4b4f-b0d1-9667c67756d2";
    const now = new Date();
    writeFileSync(join(releaseDirectory, "attention-loop.json"), JSON.stringify({
      version: 2,
      watches: [{
        id: watchId, reason: "Wait for CI", subject: "PR #184", sourceIds: ["pr-184"],
        wakeOn: ["new-evidence", "source-change", "deadline"], createdAt: now.toISOString(),
        dueAt: new Date(now.getTime() + 60_000).toISOString(),
        expiresAt: new Date(now.getTime() + 3_600_000).toISOString(), attempts: 1
      }],
      decisions: [],
      budget: { day: now.toISOString().slice(0, 10), deliberations: 0 }
    }));
    writeFileSync(join(releaseDirectory, "attention-memory.json"), JSON.stringify({
      version: 1,
      episodes: [{
        id: "evidence-pr-184", kind: "evidence", occurredAt: now.toISOString(), subject: "PR #184",
        summary: "GitHub: Review requested on PR #184", sources: [{ id: "pr-184", source: "github", app: "GitHub" }]
      }]
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
    child.stdin.end([
      "x".repeat(MAX_PROTOCOL_LINE_BYTES + 1),
      JSON.stringify({ type: "initialize", protocolVersion: 2 }),
      JSON.stringify({ type: "privacy_set_rule", id: "privacy-set", app: "Test App", mode: "digest" }),
      JSON.stringify({ type: "privacy_delete_rule", id: "privacy-delete", app: "Test App" }),
      JSON.stringify({ type: "attention_focus", id: "focus-on", active: true }),
      JSON.stringify({ type: "attention_memory_search", id: "memory-search", query: "PR #184" }),
      JSON.stringify({ type: "attention_timeline_query", id: "timeline", mode: "events", limit: 12 }),
      JSON.stringify({ type: "attention_watch_cancel", id: "watch-cancel", watchId }),
      JSON.stringify({ type: "template_delete", id: "template-delete", templateId: "general" }),
      JSON.stringify({ type: "shutdown" }),
      ""
    ].join("\n"));

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
      privacy: { defaultMode: "count-only" },
      policies: []
    });
    expect(events.find((event) => event.id === "focus-on")).toMatchObject({
      type: "attention_activity",
      activity: { state: "holding", message: "Holding updates while you focus" }
    });
    expect(events.find((event) => event.type === "attention_state" && event.id === "initialize")).toMatchObject({
      memory: { episodeCount: 1 }, watches: [{ id: watchId, subject: "PR #184" }]
    });
    expect(events.find((event) => event.type === "attention_state" && event.id === "watch-cancel")).toMatchObject({
      watches: []
    });
    expect(events.find((event) => event.type === "attention_memory_results" && event.id === "memory-search")).toMatchObject({
      query: "PR #184", results: [expect.objectContaining({ subject: "PR #184" })]
    });
    expect(events.find((event) => event.type === "attention_timeline" && event.id === "timeline")).toMatchObject({
      append: false,
      page: {
        mode: "events",
        items: [expect.objectContaining({ subject: "PR #184", kind: "evidence" })],
        threads: [expect.objectContaining({ label: "PR #184", episodeCount: 1 })]
      }
    });
    expect(events.find((event) => event.id === "privacy-delete")).toMatchObject({
      type: "privacy",
      policy: { defaultMode: "count-only" }
    });
    const deletedPrivacy = events.find((event) => event.id === "privacy-delete") as {
      policy: { rules: Array<{ app: string }> }
    };
    expect(deletedPrivacy.policy.rules.some((rule) => rule.app === "test app")).toBe(false);
    const deletedTemplate = events.find((event) => event.id === "template-delete") as {
      templates: Array<{ id: string }>
    };
    expect(deletedTemplate.templates.some((template) => template.id === "general")).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "config", "omadigest", "template-state.json"), "utf8")))
      .toEqual({ version: 1, hidden: ["general"] });
  }, 15_000);
});
