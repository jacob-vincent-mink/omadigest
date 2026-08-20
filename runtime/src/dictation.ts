import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, dirname, join } from "node:path";

export class DictationService {
  readonly #env: NodeJS.ProcessEnv;
  readonly #transcript: string;
  #voxtype: string | undefined;
  #recording = false;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.#env = env;
    const runtime = env.XDG_RUNTIME_DIR?.startsWith("/")
      ? join(env.XDG_RUNTIME_DIR, "omadigest")
      : join("/tmp", `omadigest-${process.getuid?.() ?? "user"}`);
    this.#transcript = join(runtime, "dictation.txt");
  }

  async status(): Promise<{ available: boolean; recording: boolean }> {
    this.#voxtype ??= await findExecutable("voxtype", this.#env);
    if (this.#voxtype === undefined) return { available: false, recording: false };
    const result = await run(this.#voxtype, ["status", "--format", "json"], 3_000);
    return { available: result.code === 0, recording: this.#recording };
  }

  async start(): Promise<void> {
    const status = await this.status();
    if (!status.available || this.#voxtype === undefined) throw new Error("Voxtype is not ready");
    await mkdir(dirname(this.#transcript), { recursive: true, mode: 0o700 });
    await rm(this.#transcript, { force: true });
    const result = await run(this.#voxtype, [
      "record", "start", `--file=${this.#transcript}`, "--no-auto-submit", "--no-smart-auto-submit"
    ], 5_000);
    if (result.code !== 0) throw new Error("Voxtype could not start recording");
    this.#recording = true;
  }

  async stop(timeoutMs = 60_000): Promise<string> {
    if (!this.#recording || this.#voxtype === undefined) throw new Error("Voxtype is not recording");
    const result = await run(this.#voxtype, ["record", "stop"], 5_000);
    if (result.code !== 0) throw new Error("Voxtype could not stop recording");
    this.#recording = false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const transcript = (await readFile(this.#transcript, "utf8")).trim();
        if (transcript !== "") {
          await rm(this.#transcript, { force: true });
          return transcript.slice(0, 20_000);
        }
      } catch { /* Voxtype creates the file when transcription completes. */ }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    }
    throw new Error("Voxtype transcription timed out");
  }

  async cancel(): Promise<void> {
    if (this.#voxtype !== undefined) await run(this.#voxtype, ["record", "cancel"], 5_000);
    this.#recording = false;
    await rm(this.#transcript, { force: true });
  }
}

async function findExecutable(name: string, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  for (const directory of String(env.PATH || "").split(delimiter)) {
    if (!directory.startsWith("/")) continue;
    const candidate = join(directory, name);
    try { await access(candidate, constants.X_OK); return candidate; }
    catch { /* Continue. */ }
  }
  return undefined;
}

function run(file: string, args: string[], timeout: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveRun) => {
    execFile(file, args, { encoding: "utf8", timeout, maxBuffer: 64 * 1024 }, (error, stdout, stderr) => {
      const code = error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
        ? Number((error as NodeJS.ErrnoException & { code?: unknown }).code) : error ? 1 : 0;
      resolveRun({ code, stdout, stderr });
    });
  });
}
