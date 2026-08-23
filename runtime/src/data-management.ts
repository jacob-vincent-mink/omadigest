import { rmSync } from "node:fs";
import { resolve, sep } from "node:path";

function removeInside(root: string, relative: string): void {
  const base = resolve(root);
  const target = resolve(base, relative);
  if (!target.startsWith(`${base}${sep}`)) throw new Error("Refusing to delete outside OmaDigest configuration");
  rmSync(target, { recursive: true, force: true });
}

export function clearUserTemplates(configRoot: string): void {
  removeInside(configRoot, "templates");
  removeInside(configRoot, "template-state.json");
}

export function removeUserTemplate(configRoot: string, templateId: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(templateId)) throw new Error("Invalid template ID");
  removeInside(configRoot, `templates/${templateId}`);
}

export function clearUserIntegrations(configRoot: string): void {
  removeInside(configRoot, "integrations");
  removeInside(configRoot, "integration-config");
  removeInside(configRoot, "integration-state.json");
}
