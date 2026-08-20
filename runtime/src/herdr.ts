import { execFile } from "node:child_process";

const MAX_OUTPUT = 256 * 1024;

type RunResult = { stdout: string; stderr: string };
type HerdrWorkspace = { result?: { workspace?: { workspace_id?: string }; root_pane?: { pane_id?: string } } };

export async function launchHerdrHandoff(prompt: string, cwd: string): Promise<void> {
  await run("omarchy", ["launch", "terminal", "herdr"], 15_000);
  await waitForHerdr();
  const created = await run("herdr", ["workspace", "create", "--cwd", cwd, "--label", "OmaDigest", "--focus"], 15_000);
  const parsed = JSON.parse(created.stdout) as HerdrWorkspace;
  const workspaceId = parsed.result?.workspace?.workspace_id;
  const paneId = parsed.result?.root_pane?.pane_id;
  if (!workspaceId || !paneId) throw new Error("Herdr did not return a workspace and pane");
  const name = `omadigest_${Date.now().toString(36)}`.slice(0, 32);
  await run("herdr", ["agent", "start", name, "--kind", "codex", "--pane", paneId, "--timeout", "30000"], 40_000);
  await run("herdr", ["agent", "prompt", name, prompt], 15_000);
  await run("herdr", ["workspace", "focus", workspaceId], 10_000);
  await run("herdr", ["agent", "focus", name], 10_000);
}

async function waitForHerdr(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { await run("herdr", ["workspace", "list"], 3_000); return; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  throw new Error("Herdr is unavailable");
}

function run(file: string, args: string[], timeout: number): Promise<RunResult> {
  return new Promise((resolveRun, rejectRun) => {
    execFile(file, args, { encoding: "utf8", timeout, maxBuffer: MAX_OUTPUT }, (error, stdout, stderr) => {
      if (error !== null) rejectRun(new Error(`${file} failed`));
      else resolveRun({ stdout, stderr });
    });
  });
}
