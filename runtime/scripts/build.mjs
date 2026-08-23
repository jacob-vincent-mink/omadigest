import { build } from "esbuild";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const scopedProviderCatalog = {
  name: "omadigest-scoped-provider-catalog",
  setup(context) {
    context.onResolve({ filter: /^@earendil-works\/pi-ai\/providers\/all$/ }, () => ({
      path: resolve("runtime/src/provider-catalog.ts")
    }));
    context.onResolve({ filter: /^@earendil-works\/pi-ai\/compat$/ }, () => ({
      path: resolve("runtime/src/pi-ai-compat.ts")
    }));
    context.onResolve({ filter: /^zod$/ }, () => ({
      path: resolve("runtime/src/zod-lite.ts")
    }));
  }
};

await mkdir("runtime/dist", { recursive: true });
await rm("runtime/dist/chunks", { recursive: true, force: true });
await build({
  entryPoints: { "omadigest-broker": "runtime/src/index.ts" },
  outdir: "runtime/dist",
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  splitting: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: true,
  plugins: [scopedProviderCatalog],
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __omadigestCreateRequire } from 'node:module';\nvar require = __omadigestCreateRequire(import.meta.url);"
  }
});
await chmod("runtime/dist/omadigest-broker.mjs", 0o755);

await build({
  entryPoints: ["runtime/src/authoring-cli.ts"],
  outfile: "runtime/dist/omadigest-author.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __omadigestCreateRequire } from 'node:module';\nvar require = __omadigestCreateRequire(import.meta.url);"
  }
});
await chmod("runtime/dist/omadigest-author.mjs", 0o755);

await build({
  entryPoints: ["runtime/src/handoff-claim-cli.ts"],
  outfile: "runtime/dist/omadigest-claim.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __omadigestCreateRequire } from 'node:module';\nvar require = __omadigestCreateRequire(import.meta.url);"
  }
});
await chmod("runtime/dist/omadigest-claim.mjs", 0o755);

await build({
  entryPoints: ["runtime/src/replay-cli.ts"],
  outfile: "runtime/dist/omadigest-replay.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  minify: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __omadigestCreateRequire } from 'node:module';\nvar require = __omadigestCreateRequire(import.meta.url);"
  }
});
await chmod("runtime/dist/omadigest-replay.mjs", 0o755);

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
