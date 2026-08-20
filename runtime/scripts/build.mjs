import { build } from "esbuild";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("runtime/dist", { recursive: true });
await build({
  entryPoints: ["runtime/src/index.ts"],
  outfile: "runtime/dist/omadigest-broker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __omadigestCreateRequire } from 'node:module';\nvar require = __omadigestCreateRequire(import.meta.url);"
  }
});
await chmod("runtime/dist/omadigest-broker.mjs", 0o755);

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const notices = Object.entries(lock.packages || {})
  .filter(([path, value]) => path.includes("node_modules/") && value && value.version)
  .map(([path, value]) => ({
    name: path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length),
    version: value.version,
    license: value.license || "See package",
    homepage: value.homepage || ""
  }))
  .sort((left, right) => left.name.localeCompare(right.name));
await writeFile("runtime/dist/THIRD_PARTY_NOTICES.md", [
  "# Third-party dependency notices",
  "",
  "Generated from the pinned package lock. Consult each distributed package for its complete license text.",
  "",
  ...notices.map((item) => `- **${item.name} ${item.version}** — ${item.license}${item.homepage ? ` — ${item.homepage}` : ""}`),
  ""
].join("\n"));
