import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compiledTemplateSchema } from "./template-schema.js";
import type { CompiledTemplate, DigestTemplate } from "./types.js";

const MAX_SKILL_BYTES = 128 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;

export function loadTemplates(root: string): DigestTemplate[] {
  const templates: DigestTemplate[] = [];
  if (!existsSync(root)) return templates;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = join(root, entry.name);
    const skillPath = join(directory, "SKILL.md");
    const manifestPath = join(directory, "template.compiled.json");
    try {
      if (statSync(skillPath).size > MAX_SKILL_BYTES || statSync(manifestPath).size > MAX_MANIFEST_BYTES) continue;
      const instructions = skillBody(readFileSync(skillPath, "utf8"));
      // JSON cannot contain `undefined`; after strict schema validation optional
      // keys are either absent or hold a valid value.
      const manifest = compiledTemplateSchema.parse(
        JSON.parse(readFileSync(manifestPath, "utf8"))
      ) as CompiledTemplate;
      if (manifest.id !== entry.name || instructions === "") continue;
      templates.push({ manifest, instructions, directory });
    } catch {
      // One malformed user template must not make every digest unavailable.
    }
  }
  return templates.sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}

export function skillBody(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown.trim();
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return "";
  // The human frontmatter is descriptive only. Runtime policy comes from the
  // separately schema-validated compiled manifest.
  if (markdown.slice(4, end).trim() === "") return "";
  return markdown.slice(end + 5).trim();
}
