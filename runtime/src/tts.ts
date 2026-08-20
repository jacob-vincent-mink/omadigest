import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const speechConfigSchema = z.object({
  provider: z.enum(["openai-compatible", "elevenlabs"]),
  endpoint: z.string().min(1).max(2048),
  model: z.string().min(1).max(200),
  voice: z.string().min(1).max(200),
  speed: z.number().min(0.25).max(4).default(1)
}).strict();
export type SpeechConfig = z.infer<typeof speechConfigSchema>;

export class SpeechService {
  readonly #configPath: string;
  readonly #runtimeDir: string;
  #player: ChildProcess | undefined;
  #paused = false;

  constructor(configRoot: string, env: NodeJS.ProcessEnv = process.env) {
    this.#configPath = join(configRoot, "speech.json");
    const runtime = env.XDG_RUNTIME_DIR?.startsWith("/")
      ? join(env.XDG_RUNTIME_DIR, "omadigest")
      : join("/tmp", `omadigest-${process.getuid?.() ?? "user"}`);
    this.#runtimeDir = runtime;
  }

  async status(): Promise<{ configured: boolean; playing: boolean; paused: boolean; config?: SpeechConfig }> {
    const config = await this.config();
    return {
      configured: config !== undefined,
      playing: this.#player !== undefined,
      paused: this.#paused,
      ...(config === undefined ? {} : { config })
    };
  }

  async configure(config: SpeechConfig, apiKey: string): Promise<void> {
    const validated = speechConfigSchema.parse(config);
    validateSpeechEndpoint(validated.endpoint);
    if (apiKey.trim() === "" || apiKey.length > 20_000) throw new Error("A valid TTS API key is required");
    await storeSecret(validated.provider, apiKey.trim());
    await mkdir(dirname(this.#configPath), { recursive: true, mode: 0o700 });
    const temporary = `${this.#configPath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
    const { rename } = await import("node:fs/promises");
    await rename(temporary, this.#configPath);
  }

  async speak(text: string): Promise<void> {
    const normalized = normalizeSpeechText(text);
    if (normalized === "") throw new Error("There is nothing to read");
    const config = await this.config();
    if (config === undefined) throw new Error("Configure a read-mode provider first");
    const apiKey = await lookupSecret(config.provider);
    if (apiKey === undefined) throw new Error("The read-mode credential is unavailable");
    await this.stop();
    await mkdir(this.#runtimeDir, { recursive: true, mode: 0o700 });
    const audioPath = join(this.#runtimeDir, `speech-${randomUUID()}.mp3`);
    const response = await synthesize(config, apiKey, normalized);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 50 * 1024 * 1024) throw new Error("The TTS provider returned invalid audio");
    await writeFile(audioPath, bytes, { mode: 0o600 });
    this.#player = spawn("mpv", ["--no-video", "--really-quiet", "--keep-open=no", audioPath], {
      stdio: "ignore",
      windowsHide: true
    });
    this.#paused = false;
    const player = this.#player;
    player.once("exit", () => {
      if (this.#player === player) this.#player = undefined;
      this.#paused = false;
      void rm(audioPath, { force: true });
    });
    player.once("error", () => {
      if (this.#player === player) this.#player = undefined;
      void rm(audioPath, { force: true });
    });
  }

  pauseToggle(): void {
    if (this.#player?.pid === undefined) return;
    this.#paused = !this.#paused;
    process.kill(this.#player.pid, this.#paused ? "SIGSTOP" : "SIGCONT");
  }

  async stop(): Promise<void> {
    const player = this.#player;
    this.#player = undefined;
    this.#paused = false;
    if (player?.pid !== undefined) {
      try { process.kill(player.pid, "SIGTERM"); } catch { /* Already exited. */ }
    }
  }

  private async config(): Promise<SpeechConfig | undefined> {
    try { return speechConfigSchema.parse(JSON.parse(await readFile(this.#configPath, "utf8"))); }
    catch { return undefined; }
  }
}

async function synthesize(config: SpeechConfig, apiKey: string, text: string): Promise<Response> {
  const endpoint = validateSpeechEndpoint(config.endpoint);
  if (config.provider === "openai-compatible") {
    const url = endpoint.pathname.endsWith("/audio/speech")
      ? endpoint : new URL(`${endpoint.pathname.replace(/\/$/u, "")}/audio/speech`, endpoint);
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: config.model, voice: config.voice, input: text, speed: config.speed, response_format: "mp3" }),
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) throw new Error(`The TTS provider rejected the request (${response.status})`);
    return response;
  }
  const url = new URL(`${endpoint.pathname.replace(/\/$/u, "")}/v1/text-to-speech/${encodeURIComponent(config.voice)}`, endpoint);
  const response = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: config.model }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`ElevenLabs rejected the request (${response.status})`);
  return response;
}

export function validateSpeechEndpoint(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Enter a complete TTS endpoint URL"); }
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
    throw new Error("TTS endpoints must use HTTPS, except local loopback servers");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
    throw new Error("TTS endpoints cannot contain credentials, query parameters, or fragments");
  return url;
}

export function normalizeSpeechText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gu, " Code block omitted. ")
    .replace(/\[([^\]]+)\]\([^\)]+\)/gu, "$1")
    .replace(/https?:\/\/\S+/gu, " link ")
    .replace(/[*_#>`~]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 20_000);
}

function storeSecret(provider: string, secret: string): Promise<void> {
  return new Promise((resolveStore, rejectStore) => {
    const child = spawn("secret-tool", ["store", "--label=OmaDigest read mode", "application", "omadigest", "purpose", "tts", "provider", provider], {
      stdio: ["pipe", "ignore", "ignore"]
    });
    child.stdin.end(`${secret}\n`);
    child.once("error", rejectStore);
    child.once("exit", (code) => code === 0 ? resolveStore() : rejectStore(new Error("The TTS credential could not be stored")));
  });
}

function lookupSecret(provider: string): Promise<string | undefined> {
  return new Promise((resolveLookup) => {
    execFile("secret-tool", ["lookup", "application", "omadigest", "purpose", "tts", "provider", provider], {
      encoding: "utf8", timeout: 5_000, maxBuffer: 32 * 1024
    }, (error, stdout) => resolveLookup(error === null && stdout.trim() !== "" ? stdout.trim() : undefined));
  });
}
