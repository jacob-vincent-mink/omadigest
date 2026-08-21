import { claimHandoff } from "./handoff-transport.js";

const token = process.argv[2];
if (token === undefined || process.argv.length !== 3) {
  process.stderr.write("Usage: omadigest-claim <capability>\n");
  process.exitCode = 2;
} else {
  try {
    process.stdout.write(`${await claimHandoff(token)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The OmaDigest handoff failed";
    process.stderr.write(`${message.replace(/[\r\n\u0000-\u001f]+/gu, " ").slice(0, 300)}\n`);
    process.exitCode = 1;
  }
}
