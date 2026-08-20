import { existsSync, lstatSync, mkdirSync, readlinkSync, renameSync, symlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

const SKILL_NAME = "omadigest-authoring";

export function installAuthoringSkillLinks(pluginRoot: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.HOME?.trim();
  if (!home?.startsWith("/")) throw new Error("OmaDigest cannot resolve the agent skill directories");
  const source = resolve(pluginRoot, "skills", SKILL_NAME);
  if (!existsSync(join(source, "SKILL.md")) || !lstatSync(source).isDirectory())
    throw new Error("The packaged integration-authoring skill is unavailable");
  const roots = [
    join(home, ".agents", "skills"),
    join(home, ".claude", "skills"),
    join(home, ".codex", "skills"),
    join(home, ".pi", "agent", "skills")
  ];
  const destinations: string[] = [];
  for (const root of roots) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const destination = join(root, SKILL_NAME);
    if (existsSync(destination) && !lstatSync(destination).isSymbolicLink())
      throw new Error(`A non-symlink skill already exists at ${destination}`);
    if (existsSync(destination) && resolve(root, readlinkSync(destination)) === source) {
      destinations.push(destination);
      continue;
    }
    const temporary = `${destination}.link-${randomUUID()}`;
    symlinkSync(source, temporary, "dir");
    renameSync(temporary, destination);
    destinations.push(destination);
  }
  return destinations;
}
