import { mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installAuthoringSkillLinks } from "../src/skill-install.js";

const roots: string[] = [];
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("default-agent authoring skill installation", () => {
  it("links the packaged skill into shared and supported agent directories", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-skill-install-"));
    roots.push(root);
    const plugin = join(root, "plugin");
    const source = join(plugin, "skills", "omadigest-authoring");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "SKILL.md"), "---\nname: omadigest-authoring\n---\n");
    const destinations = installAuthoringSkillLinks(plugin, { HOME: join(root, "home") });
    expect(destinations).toHaveLength(4);
    for (const destination of destinations) expect(resolve(join(destination, ".."), readlinkSync(destination))).toBe(source);
  });

  it("does not overwrite a user-owned skill directory", () => {
    const root = mkdtempSync(join(tmpdir(), "omadigest-skill-install-"));
    roots.push(root);
    const source = join(root, "plugin", "skills", "omadigest-authoring");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "SKILL.md"), "skill\n");
    mkdirSync(join(root, "home", ".agents", "skills", "omadigest-authoring"), { recursive: true });
    expect(() => installAuthoringSkillLinks(join(root, "plugin"), { HOME: join(root, "home") }))
      .toThrow(/non-symlink skill/u);
  });
});
