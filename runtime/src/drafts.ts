import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DraftResult, IntegrationDraft, TemplateDraft } from "./agent.js";
import { integrationManifestSchema } from "./integration-schema.js";

export function installDraft(configRoot: string, draft: DraftResult): "template" | "integration" {
  if (draft.kind === "out-of-scope" || draft.kind === "clarification")
    throw new Error("Only complete template or integration drafts can be installed");
  return draft.kind === "template"
    ? installTemplate(configRoot, draft)
    : installIntegration(configRoot, draft);
}

function installTemplate(configRoot: string, draft: TemplateDraft): "template" {
  const destination = join(configRoot, "templates", draft.compiled.id);
  const temporary = `${destination}.draft-${randomUUID()}`;
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(join(temporary, "SKILL.md"), `${draft.skillMarkdown.trim()}\n`, { mode: 0o600 });
    writeFileSync(join(temporary, "template.compiled.json"), `${JSON.stringify(draft.compiled, null, 2)}\n`, { mode: 0o600 });
    replaceDirectory(temporary, destination);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return "template";
}

function installIntegration(configRoot: string, draft: IntegrationDraft): "integration" {
  const manifestFile = draft.files.find((file) => file.path === "manifest.json");
  if (manifestFile === undefined) throw new Error("Integration draft has no manifest");
  const manifest = integrationManifestSchema.parse(JSON.parse(manifestFile.content));
  const destination = join(configRoot, "integrations", manifest.id);
  const temporary = `${destination}.draft-${randomUUID()}`;
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  try {
    for (const file of draft.files) {
      const path = join(temporary, file.path);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      writeFileSync(path, file.content, { mode: 0o600 });
    }
    const restrictedEnvironment = { PATH: process.env.PATH || "/usr/bin", HOME: "/nonexistent", LANG: process.env.LANG || "C.UTF-8" };
    execFileSync(process.execPath, ["--check", join(temporary, "connector.mjs")], {
      timeout: 10_000, stdio: "ignore", env: restrictedEnvironment
    });
    execFileSync(process.execPath, ["--check", join(temporary, "connector.test.mjs")], {
      timeout: 10_000, stdio: "ignore", env: restrictedEnvironment
    });
    execFileSync("bwrap", [
      "--die-with-parent", "--unshare-all",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", temporary, "/integration",
      "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
      "--setenv", "HOME", "/nonexistent",
      "/usr/bin/node", "--test", "/integration/connector.test.mjs"
    ], { timeout: 20_000, stdio: "ignore", env: restrictedEnvironment });
    replaceDirectory(temporary, destination);
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return "integration";
}

function replaceDirectory(temporary: string, destination: string): void {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  const backup = `${destination}.backup-${randomUUID()}`;
  let backedUp = false;
  try {
    try { renameSync(destination, backup); backedUp = true; } catch { /* New package. */ }
    renameSync(temporary, destination);
    if (backedUp) rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (backedUp) {
      try { renameSync(backup, destination); } catch { /* Preserve backup for manual recovery. */ }
    }
    throw error;
  }
}
