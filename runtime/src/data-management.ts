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
}

export function clearUserIntegrations(configRoot: string): void {
  removeInside(configRoot, "integrations");
  removeInside(configRoot, "integration-config");
  removeInside(configRoot, "integration-state.json");
}
