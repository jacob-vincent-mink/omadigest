import { execFile } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const run = promisify(execFile);
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("bundled broker handoff boundary", () => {
  it("keeps request content out of launched process arguments and serves it through one claim", async () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-broker-handoff-"));
    roots.push(root);
    const bin = join(root, "bin");
    const capture = join(root, "argv.txt");
    mkdirSync(bin);
    const fakeOmarchy = join(bin, "omarchy");
    writeFileSync(fakeOmarchy, "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$OMADIGEST_ARGV_CAPTURE\"\n", { mode: 0o700 });
    chmodSync(fakeOmarchy, 0o700);
    const env = {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: join(root, "config"),
      XDG_STATE_HOME: join(root, "state"),
      XDG_RUNTIME_DIR: join(root, "run"),
      OMADIGEST_PLUGIN_DIR: process.cwd(),
      OMADIGEST_ARGV_CAPTURE: capture,
      PATH: `${bin}:${process.env.PATH ?? ""}`
    };
    const child = execFile(process.execPath, [resolve("runtime/dist/omadigest-broker.mjs")], { env });
    let stdout = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout = (stdout + String(chunk)).slice(-512 * 1024); });
    const request = "Build an integration for private.example.invalid";

    try {
      child.stdin?.write(`${JSON.stringify({ type: "authoring_handoff", id: "handoff-test", kind: "integration", request })}\n`);
      await waitUntil(() => stdout.includes('"type":"handoff"'), 5_000);
      const argv = readFileSync(capture, "utf8");
      expect(argv).not.toContain(request);
      expect(argv).toContain("omadigest-claim.mjs");
      const token = argv.match(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu)?.[0];
      expect(token).toBeDefined();
      const claimed = await run(process.execPath, [resolve("runtime/dist/omadigest-claim.mjs"), token!], {
        env, timeout: 5_000, maxBuffer: 256 * 1024
      });
      expect(claimed.stdout).toContain(request);
      child.stdin?.end(`${JSON.stringify({ type: "shutdown" })}\n`);
      await waitForExit(child, 5_000);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }, 15_000);
});

async function waitUntil(predicate: () => boolean, timeout: number): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for broker output");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

function waitForExit(child: ReturnType<typeof execFile>, timeout: number): Promise<void> {
  return new Promise((resolveExit, rejectExit) => {
    if (child.exitCode !== null) { resolveExit(); return; }
    const timer = setTimeout(() => rejectExit(new Error("Timed out waiting for broker exit")), timeout);
    child.once("exit", () => { clearTimeout(timer); resolveExit(); });
    child.once("error", (error) => { clearTimeout(timer); rejectExit(error); });
  });
}
