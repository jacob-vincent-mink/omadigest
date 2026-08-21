import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, rm } from "node:fs/promises";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import { dirname, join, resolve } from "node:path";

const CLAIM_TTL_MS = 5 * 60_000;
const MAX_PENDING_CLAIMS = 8;
const MAX_REQUEST_BYTES = 2 * 1024;
const MAX_PAYLOAD_BYTES = 160 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const SOCKET_TIMEOUT_MS = 5_000;

type PendingClaim = { payload: string; expiresAt: number };
type ClaimResponse = { ok: true; payload: string } | { ok: false; error: string };

export class HandoffTransport {
  readonly #socketPath: string;
  readonly #claimCliPath: string;
  readonly #claims = new Map<string, PendingClaim>();
  #server: Server | undefined;
  #connections = 0;

  constructor(pluginRoot: string, env: NodeJS.ProcessEnv = process.env) {
    this.#socketPath = handoffSocketPath(env);
    this.#claimCliPath = resolve(pluginRoot, "runtime", "dist", "omadigest-claim.mjs");
  }

  get socketPath(): string { return this.#socketPath; }

  async start(): Promise<void> {
    if (this.#server !== undefined) return;
    const directory = dirname(this.#socketPath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    try {
      const existing = await lstat(this.#socketPath);
      if (!existing.isSocket()) throw new Error("The OmaDigest handoff socket path is not a socket");
      await rm(this.#socketPath);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }

    const server = createServer((socket) => this.#accept(socket));
    server.maxConnections = 16;
    await new Promise<void>((resolveListen, rejectListen) => {
      const fail = (error: Error) => { server.close(); rejectListen(error); };
      server.once("error", fail);
      server.listen(this.#socketPath, () => {
        server.off("error", fail);
        resolveListen();
      });
    });
    await chmod(this.#socketPath, 0o600);
    server.unref();
    this.#server = server;
  }

  issue(payload: string, now = Date.now()): { token: string; instruction: string } {
    if (this.#server === undefined) throw new Error("The OmaDigest handoff transport is unavailable");
    const bytes = Buffer.byteLength(payload, "utf8");
    if (bytes === 0 || bytes > MAX_PAYLOAD_BYTES) throw new Error("The OmaDigest handoff payload is invalid");
    this.#prune(now);
    while (this.#claims.size >= MAX_PENDING_CLAIMS) {
      const oldest = this.#claims.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#claims.delete(oldest);
    }
    const token = randomUUID();
    this.#claims.set(token, { payload, expiresAt: now + CLAIM_TTL_MS });
    return { token, instruction: formatClaimInstruction(this.#claimCliPath, token) };
  }

  revoke(token: string): void { this.#claims.delete(token); }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = undefined;
    this.#claims.clear();
    if (server !== undefined) await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await rm(this.#socketPath, { force: true });
  }

  #accept(socket: Socket): void {
    if (this.#connections >= 16) { socket.destroy(); return; }
    this.#connections += 1;
    socket.setTimeout(SOCKET_TIMEOUT_MS, () => socket.destroy());
    let request = Buffer.alloc(0);
    let handled = false;
    const finish = () => { this.#connections = Math.max(0, this.#connections - 1); };
    socket.once("close", finish);
    socket.on("data", (chunk: Buffer) => {
      if (handled) return;
      if (request.length + chunk.length > MAX_REQUEST_BYTES) {
        handled = true;
        this.#respond(socket, { ok: false, error: "invalid_request" });
        return;
      }
      request = Buffer.concat([request, chunk]);
      const newline = request.indexOf(0x0a);
      if (newline === -1) return;
      handled = true;
      try {
        const parsed: unknown = JSON.parse(request.subarray(0, newline).toString("utf8"));
        if (!isClaimRequest(parsed)) throw new Error("invalid request");
        const claim = this.#claims.get(parsed.token);
        this.#claims.delete(parsed.token);
        if (claim === undefined || claim.expiresAt <= Date.now()) {
          this.#respond(socket, { ok: false, error: "claim_unavailable" });
          return;
        }
        this.#respond(socket, { ok: true, payload: claim.payload });
      } catch {
        this.#respond(socket, { ok: false, error: "invalid_request" });
      }
    });
  }

  #respond(socket: Socket, response: ClaimResponse): void {
    const encoded = `${JSON.stringify(response)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > MAX_RESPONSE_BYTES) socket.end(`${JSON.stringify({ ok: false, error: "response_too_large" })}\n`);
    else socket.end(encoded);
  }

  #prune(now: number): void {
    for (const [token, claim] of this.#claims) if (claim.expiresAt <= now) this.#claims.delete(token);
  }
}

export function handoffSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_RUNTIME_DIR?.startsWith("/")
    ? join(env.XDG_RUNTIME_DIR, "omadigest")
    : join("/tmp", `omadigest-${process.getuid?.() ?? "user"}`);
  return join(base, "handoff.sock");
}

export function formatClaimInstruction(claimCliPath: string, token: string): string {
  return [
    "Continue the explicit, user-approved OmaDigest handoff.",
    "Run the command below exactly once and use its output as the task. The capability contains no task data and expires after five minutes.",
    "",
    `${shellQuote(process.execPath)} ${shellQuote(claimCliPath)} ${shellQuote(token)}`
  ].join("\n");
}

export async function claimHandoff(token: string, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(token))
    throw new Error("The OmaDigest handoff capability is invalid");
  const socket = createConnection(handoffSocketPath(env));
  socket.setTimeout(SOCKET_TIMEOUT_MS, () => socket.destroy(new Error("The OmaDigest handoff timed out")));
  let response = Buffer.alloc(0);
  return await new Promise<string>((resolveClaim, rejectClaim) => {
    socket.once("connect", () => socket.end(`${JSON.stringify({ version: 1, token })}\n`));
    socket.on("data", (chunk: Buffer) => {
      if (response.length + chunk.length > MAX_RESPONSE_BYTES) {
        socket.destroy(new Error("The OmaDigest handoff response was too large"));
        return;
      }
      response = Buffer.concat([response, chunk]);
    });
    socket.once("error", rejectClaim);
    socket.once("end", () => {
      try {
        const parsed: unknown = JSON.parse(response.toString("utf8"));
        if (!isClaimResponse(parsed)) throw new Error("The OmaDigest handoff response was invalid");
        if (!parsed.ok) throw new Error("The OmaDigest handoff is unavailable or expired");
        resolveClaim(parsed.payload);
      } catch (error) { rejectClaim(error); }
    });
  });
}

function isClaimRequest(value: unknown): value is { version: 1; token: string } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.version === 1 && typeof record.token === "string" && Object.keys(record).length === 2;
}

function isClaimResponse(value: unknown): value is ClaimResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.ok === true && typeof record.payload === "string"
    || record.ok === false && typeof record.error === "string";
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'"'"'`)}'`; }
