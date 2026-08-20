import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { DraftResult, IntegrationDraft, TemplateDraft } from "./agent.js";
import { integrationManifestSchema } from "./integration-schema.js";
import { validateIntegrationPackageDirectory } from "./integration-package-validation.js";
import { compiledTemplateSchema } from "./template-schema.js";

export function installDraft(configRoot: string, draft: DraftResult): "template" | "integration" {
  if (draft.kind === "out-of-scope" || draft.kind === "clarification")
    throw new Error("Only complete template or integration drafts can be installed");
  return draft.kind === "template"
    ? installTemplate(configRoot, draft)
    : installIntegration(configRoot, draft);
}

export function installTemplateEdit(configRoot: string, templateId: string, instructionsValue: string, compiledJson: string): "template" {
  if (Buffer.byteLength(instructionsValue, "utf8") > 128 * 1024) throw new Error("Template instructions exceed the byte limit");
  if (Buffer.byteLength(compiledJson, "utf8") > 64 * 1024) throw new Error("Template policy exceeds the byte limit");
  const compiled = compiledTemplateSchema.parse(JSON.parse(compiledJson));
  if (compiled.id !== templateId) throw new Error("The template ID cannot change during an edit");
  const instructions = instructionsValue.trim();
  if (instructions === "") throw new Error("Template instructions cannot be empty");
  const skillMarkdown = [
    "---", `name: ${compiled.id}`, `description: ${JSON.stringify(compiled.description)}`, "---", "", instructions
  ].join("\n");
  return installTemplate(configRoot, { kind: "template", skillMarkdown, compiled });
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
    validateIntegrationPackageDirectory(temporary);
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
