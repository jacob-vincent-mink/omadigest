import { runBroker } from "./broker.js";

runBroker().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown broker failure";
  process.stderr.write(`omadigest: ${message.replace(/[\r\n\u0000-\u001f]+/gu, " ").slice(0, 300)}\n`);
  process.exitCode = 1;
});
