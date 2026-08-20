import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { installDraft } from "./drafts.js";
import { integrationManifestSchema } from "./integration-schema.js";
import { integrationConfigRoot, setIntegrationEnabled } from "./integrations.js";
import { validateIntegrationPackageFiles } from "./integration-package-validation.js";

const MAX_FILES = 12;
const MAX_FILE_BYTES = 120_000;
const MAX_TOTAL_BYTES = 300_000;
const REQUIRED_FILES = new Set(["manifest.json", "connector.mjs", "connector.test.mjs", "README.md"]);

export type AuthoringPackage = {
  id: string;
  files: Array<{ path: string; content: string }>;
};

export function validateAuthoringDirectory(directory: string): AuthoringPackage {
  const root = resolve(directory);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error("The authoring source must be a real directory");
  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;
  const visit = (current: string, depth: number): void => {
    if (depth > 3) throw new Error("Integration package nesting is too deep");
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = resolve(current, entry.name);
      if (!absolute.startsWith(`${root}${sep}`)) throw new Error("Integration package path escaped staging");
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("Integration packages cannot contain symbolic links");
      if (stat.isDirectory()) { visit(absolute, depth + 1); continue; }
      if (!stat.isFile()) throw new Error("Integration packages may contain only regular files");
      if (files.length >= MAX_FILES) throw new Error(`Integration packages may contain at most ${MAX_FILES} files`);
      if (stat.size > MAX_FILE_BYTES) throw new Error(`${entry.name} exceeds the per-file byte limit`);
      totalBytes += stat.size;
      if (totalBytes > MAX_TOTAL_BYTES) throw new Error("Integration package exceeds the total byte limit");
      const path = relative(root, absolute).split(sep).join("/");
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$/u.test(path) || path.includes(".."))
        throw new Error(`Unsafe integration path: ${path}`);
      files.push({ path, content: readFileSync(absolute, "utf8") });
    }
  };
  visit(root, 0);
  const names = new Set(files.map((file) => file.path));
  for (const required of REQUIRED_FILES) if (!names.has(required)) throw new Error(`Integration package is missing ${required}`);
  const manifestFile = files.find((file) => file.path === "manifest.json");
  if (manifestFile === undefined) throw new Error("Integration package has no manifest");
  const manifest = integrationManifestSchema.parse(JSON.parse(manifestFile.content));
  validateIntegrationPackageFiles(files);
  return { id: manifest.id, files };
}

export function installAuthoringDirectory(directory: string, configRoot = integrationConfigRoot()): AuthoringPackage {
  const prepared = validateAuthoringDirectory(directory);
  installDraft(configRoot, { kind: "integration", files: prepared.files });
  setIntegrationEnabled(resolve(configRoot, "integration-state.json"), prepared.id, false);
  return prepared;
}
