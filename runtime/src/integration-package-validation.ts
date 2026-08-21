import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type IntegrationFile = { path: string; content: string };

export function validateIntegrationPackageFiles(files: IntegrationFile[]): void {
  const temporary = mkdtempSync(join(tmpdir(), "omadigest-integration-check-"));
  try {
    for (const file of files) {
      const path = join(temporary, file.path);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, file.content, { mode: 0o600 });
    }
    validateIntegrationPackageDirectory(temporary);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

export function validateIntegrationPackageDirectory(directory: string): void {
  const environment = { PATH: process.env.PATH || "/usr/bin", HOME: "/nonexistent", LANG: process.env.LANG || "C.UTF-8" };
  runChecked("connector.mjs syntax", process.execPath, ["--check", join(directory, "connector.mjs")], environment, 10_000);
  runChecked("connector.test.mjs syntax", process.execPath, ["--check", join(directory, "connector.test.mjs")], environment, 10_000);
  runChecked("integration tests", "bwrap", [
    "--die-with-parent", "--unshare-all",
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", directory, "/integration",
    "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
    "--setenv", "HOME", "/nonexistent",
    "/usr/bin/node", "--test", "/integration/connector.test.mjs"
  ], environment, 20_000);
  validateDefaultProbe(directory, environment);
}

function validateDefaultProbe(directory: string, environment: NodeJS.ProcessEnv): void {
  const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")) as {
    entryPoint?: string;
    setup?: { fields?: Array<{ key?: string; type?: string; required?: boolean }> };
    permissions?: { commands?: string[]; networkHosts?: string[] };
  };
  const fields = manifest.setup?.fields || [];
  if (fields.some((field) => field.required === true && field.type !== "boolean")) return;
  const commands = manifest.permissions?.commands || [];
  if (commands.length > 0) throw new Error("default probe failed: connector host commands are unsupported");
  if ((manifest.permissions?.networkHosts || []).length > 0) return;

  const config = Object.fromEntries(fields.map((field) => [String(field.key || ""), field.type === "boolean" ? true : ""]));
  const requestId = "validation-probe";
  try {
    const args = [
      "--die-with-parent", "--unshare-all",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", directory, "/integration",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
      "--setenv", "HOME", "/nonexistent", "--setenv", "PATH", "/nonexistent"
    ];
    args.push("/usr/bin/node", "--permission", "--allow-fs-read=/integration");
    args.push(`/integration/${String(manifest.entryPoint || "connector.mjs")}`);
    const input = `${JSON.stringify({ version: 1, type: "probe", id: requestId, config })}\n${JSON.stringify({ version: 1, type: "shutdown", id: "validation-shutdown" })}\n`;
    const stdout = execFileSync("bwrap", args, {
      timeout: 15_000, encoding: "utf8", input, env: environment, stdio: ["pipe", "pipe", "pipe"]
    });
    const line = stdout.split("\n").find((value) => value.trim() !== "");
    const response = line ? JSON.parse(line) as { type?: string; state?: string; id?: string; message?: string } : {};
    if (response.type !== "status" || response.state !== "ready" || response.id !== requestId)
      throw new Error(String(response.message || "connector did not return a ready status with the request id"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("default probe failed")) throw error;
    const details = error && typeof error === "object" && "stderr" in error
      ? String((error as { stderr?: string | Buffer }).stderr || "").trim().slice(0, 1_200)
      : error instanceof Error ? error.message : "";
    throw new Error(`default probe failed${details ? `: ${details}` : ""}`);
  }
}

function runChecked(label: string, executable: string, args: string[], environment: NodeJS.ProcessEnv, timeout: number): void {
  try {
    execFileSync(executable, args, { timeout, encoding: "utf8", env: environment, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const details = error && typeof error === "object" && "stderr" in error
      ? String((error as { stderr?: string | Buffer }).stderr || "").trim().slice(0, 1_200)
      : "";
    throw new Error(`${label} failed${details ? `: ${details}` : ""}`);
  }
}
