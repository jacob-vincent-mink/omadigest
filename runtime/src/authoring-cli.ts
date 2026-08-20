import { installAuthoringDirectory, validateAuthoringDirectory } from "./authoring-package.js";

function usage(): never {
  process.stderr.write("Usage: omadigest-author <validate|install> <staging-directory>\n");
  process.exit(2);
}

const operation = process.argv[2];
const directory = process.argv[3];
if ((operation !== "validate" && operation !== "install") || !directory || process.argv.length !== 4) usage();

try {
  const prepared = operation === "install" ? installAuthoringDirectory(directory) : validateAuthoringDirectory(directory);
  process.stdout.write(`${JSON.stringify({ ok: true, operation, id: prepared.id, files: prepared.files.map((file) => file.path), enabled: false })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : "OmaDigest authoring validation failed";
  process.stderr.write(`${message.slice(0, 2_000)}\n`);
  process.exit(1);
}
