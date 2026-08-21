import { openaiProvider } from "../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/openai.js";
import { openaiCodexProvider } from "../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/openai-codex.js";
import { radiusProvider } from "../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/radius.js";
import { xaiProvider } from "../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/providers/xai.js";

// OmaDigest deliberately exposes only these providers. Keeping the catalog scoped
// avoids shipping Pi's unrelated CLI/TUI and every provider's model inventory.
export function builtinProviders() {
  return [openaiCodexProvider(), openaiProvider(), xaiProvider()];
}

export function getBuiltinModelDataGeneratedAt(): undefined {
  return undefined;
}

export { radiusProvider };
