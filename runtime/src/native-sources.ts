import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  renameSync,
  statSync,
  statfsSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const CRASH_COMMAND = "/usr/bin/coredumpctl";
const UPDATE_COMMAND = "/usr/share/omarchy/bin/omarchy-update-available";
const SYSTEMCTL_COMMAND = "/usr/bin/systemctl";
const NMCLI_COMMAND = "/usr/bin/nmcli";
const HERDR_COMMAND = "/usr/bin/herdr";
const POWER_ROOT = "/sys/class/power_supply";
const MAX_COMMAND_BYTES = 256 * 1024;
const MAX_EVENTS = 256;
const MAX_STATE_BYTES = 256 * 1024;
const RETENTION_MS = 7 * 86_400_000;

export type NativeSourceCategory = {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

export type NativeSourceDefinition = {
  id: string;
  name: string;
  description: string;
  categories: NativeSourceCategory[];
};

export const NATIVE_SOURCE_CATALOG: NativeSourceDefinition[] = [
  {
    id: "io.omarchy.crash-reports",
    name: "Crash Reports",
    description: "Summarizes recent application crashes from the local system journal.",
    categories: [{
      id: "application-crashes",
      label: "Application crashes",
      description: "Program name, signal, process ID, and crash time; never core contents.",
      defaultEnabled: true
    }]
  },
  {
    id: "io.omarchy.updates",
    name: "Omarchy Updates",
    description: "Reports when an Omarchy update is available.",
    categories: [{
      id: "available-updates",
      label: "Available updates",
      description: "Bounded package or development-checkout update summaries.",
      defaultEnabled: true
    }]
  },
  {
    id: "io.omarchy.system-telemetry",
    name: "System Telemetry",
    description: "Local power, storage, network, and service-state signals.",
    categories: [
      { id: "power", label: "Power", description: "Charger connect and disconnect transitions.", defaultEnabled: true },
      { id: "battery", label: "Battery", description: "Low and critical battery threshold transitions.", defaultEnabled: true },
      { id: "storage", label: "Storage", description: "Low free-space warnings for the root filesystem.", defaultEnabled: true },
      { id: "network", label: "Network", description: "Connectivity state transitions without network names.", defaultEnabled: false },
      { id: "failed-services", label: "Failed services", description: "Names of failed user services without journal bodies.", defaultEnabled: true }
    ]
  },
  {
    id: "io.omarchy.herdr",
    name: "Herdr Agents",
    description: "Local completion, blocker, and active-agent signals from Herdr.",
    categories: [
      { id: "completed-agents", label: "Completed agents", description: "Agents that moved into the done state.", defaultEnabled: true },
      { id: "blocked-agents", label: "Blocked agents", description: "Agents that moved into the blocked state.", defaultEnabled: true },
      { id: "active-agents", label: "Active agents", description: "A bounded point-in-time count of working agents.", defaultEnabled: false }
    ]
  }
];

export type NativeSourceItem = {
  id: string;
  source: string;
  category: string;
  app: string;
  title: string;
  body: string;
  urgency: "low" | "normal" | "critical";
  occurredAt: string;
};

export type TelemetrySnapshot = {
  capturedAt: string;
  onBattery?: boolean;
  batteryPercent?: number;
  batteryState?: string;
  networkState?: string;
};

export type HerdrAgentSnapshot = { id: string; name: string; status: string };

type StoredState = { version: 1; snapshot?: TelemetrySnapshot; agents?: HerdrAgentSnapshot[]; events: NativeSourceItem[] };
type CommandResult = { code: number; stdout: string };

export type NativeSourceDependencies = {
  run: (file: string, args: string[]) => Promise<CommandResult>;
  now: () => Date;
  readPowerSupplies: () => Array<Record<string, string>>;
  rootDisk: () => { total: number; available: number };
};

export class NativeSourceStore {
  readonly #path: string;

  constructor(configRoot: string) {
    this.#path = join(configRoot, "native-source-state.json");
  }

  read(now = new Date()): StoredState {
    try {
      if (statSync(this.#path).size > MAX_STATE_BYTES) return { version: 1, events: [] };
      const parsed: unknown = JSON.parse(readFileSync(this.#path, "utf8"));
      if (!isObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.events)) return { version: 1, events: [] };
      const cutoff = now.getTime() - RETENTION_MS;
      const events = parsed.events.flatMap(parseStoredItem).filter((item) => new Date(item.occurredAt).getTime() >= cutoff).slice(-MAX_EVENTS);
      const snapshot = parseSnapshot(parsed.snapshot);
      const agents = parseStoredAgents(parsed.agents);
      return { version: 1, ...(snapshot ? { snapshot } : {}), ...(agents ? { agents } : {}), events };
    } catch {
      return { version: 1, events: [] };
    }
  }

  write(state: StoredState, now = new Date()): void {
    const cutoff = now.getTime() - RETENTION_MS;
    const bounded: StoredState = {
      version: 1,
      ...(state.snapshot ? { snapshot: state.snapshot } : {}),
      ...(state.agents ? { agents: state.agents.slice(0, 64) } : {}),
      events: state.events.filter((item) => new Date(item.occurredAt).getTime() >= cutoff).slice(-MAX_EVENTS)
    };
    const serialized = `${JSON.stringify(bounded, null, 2)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) throw new Error("Native source state is too large");
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, serialized, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }

  clear(): void { rmSync(this.#path, { force: true }); }
}

export function nativeSourceStatus(id: string): { ready: boolean; message: string } {
  if (id === "io.omarchy.crash-reports")
    return existsSync(CRASH_COMMAND)
      ? { ready: true, message: "System crash metadata is available" }
      : { ready: false, message: "systemd crash metadata is unavailable" };
  if (id === "io.omarchy.updates")
    return existsSync(UPDATE_COMMAND)
      ? { ready: true, message: "Omarchy update checks are available" }
      : { ready: false, message: "The Omarchy update checker is unavailable" };
  if (id === "io.omarchy.system-telemetry")
    return existsSync(POWER_ROOT) || existsSync(SYSTEMCTL_COMMAND)
      ? { ready: true, message: "Local system telemetry is available" }
      : { ready: false, message: "Local system telemetry is unavailable" };
  if (id === "io.omarchy.herdr")
    return existsSync(HERDR_COMMAND)
      ? { ready: true, message: "Herdr agent status is available" }
      : { ready: false, message: "Herdr is unavailable" };
  return { ready: false, message: "That Omarchy source is unavailable" };
}

export async function sampleNativeTelemetry(
  previous: TelemetrySnapshot | undefined,
  dependencies: NativeSourceDependencies = systemDependencies
): Promise<{ snapshot: TelemetrySnapshot; events: NativeSourceItem[] }> {
  const now = dependencies.now();
  const supplies = parsePowerSupplies(dependencies.readPowerSupplies());
  const network = await readNetworkState(dependencies);
  const snapshot: TelemetrySnapshot = {
    capturedAt: now.toISOString(),
    ...(supplies.onBattery === undefined ? {} : { onBattery: supplies.onBattery }),
    ...(supplies.batteryPercent === undefined ? {} : { batteryPercent: supplies.batteryPercent }),
    ...(supplies.batteryState === undefined ? {} : { batteryState: supplies.batteryState }),
    ...(network === undefined ? {} : { networkState: network })
  };
  return { snapshot, events: deriveTelemetryEvents(previous, snapshot) };
}

export async function sampleHerdrAgents(
  previous: HerdrAgentSnapshot[] | undefined,
  dependencies: NativeSourceDependencies = systemDependencies
): Promise<{ agents: HerdrAgentSnapshot[]; events: NativeSourceItem[] }> {
  const response = await dependencies.run(HERDR_COMMAND, ["agent", "list"]);
  if (response.code !== 0) return { agents: previous ?? [], events: [] };
  const agents = parseHerdrAgents(response.stdout);
  return { agents, events: deriveHerdrEvents(previous, agents, dependencies.now()) };
}

export async function collectNativeSourceItems(
  enabled: Record<string, string[]>,
  since: Date,
  until: Date,
  stored: StoredState,
  dependencies: NativeSourceDependencies = systemDependencies
): Promise<NativeSourceItem[]> {
  const results: NativeSourceItem[] = stored.events.filter((item) =>
    categoryEnabled(enabled, item.source, item.category) && within(item.occurredAt, since, until));

  if (categoryEnabled(enabled, "io.omarchy.crash-reports", "application-crashes")) {
    const response = await dependencies.run(CRASH_COMMAND, [
      "--no-pager", "--no-legend", `--since=${since.toISOString()}`, `--until=${until.toISOString()}`, "--json=short"
    ]);
    if (response.code === 0) results.push(...parseCoredumps(response.stdout, since, until));
  }

  if (categoryEnabled(enabled, "io.omarchy.updates", "available-updates")) {
    const response = await dependencies.run(UPDATE_COMMAND, []);
    results.push(...parseOmarchyUpdates(response.stdout, response.code, dependencies.now()));
  }

  if (categoryEnabled(enabled, "io.omarchy.system-telemetry", "storage")) {
    results.push(...storageWarning(dependencies.rootDisk(), dependencies.now()));
  }

  if (categoryEnabled(enabled, "io.omarchy.system-telemetry", "failed-services")) {
    const response = await dependencies.run(SYSTEMCTL_COMMAND, ["--user", "--failed", "--no-legend", "--plain"]);
    if (response.code === 0) results.push(...parseFailedServices(response.stdout, dependencies.now()));
  }

  if (categoryEnabled(enabled, "io.omarchy.herdr", "active-agents")) {
    const response = await dependencies.run(HERDR_COMMAND, ["agent", "list"]);
    if (response.code === 0) results.push(...activeHerdrItem(parseHerdrAgents(response.stdout), dependencies.now()));
  }

  return deduplicate(results).filter((item) => within(item.occurredAt, since, until)).slice(0, 200);
}

export function parseCoredumps(raw: string, since = new Date(0), until = new Date(8_640_000_000_000_000)): NativeSourceItem[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return values.flatMap((value): NativeSourceItem[] => {
    if (!isObject(value)) return [];
    const occurredAt = coredumpTime(value.time);
    if (occurredAt === undefined || !within(occurredAt, since, until)) return [];
    const executable = bounded(basename(String(value.exe || "")), 120) || "Application";
    const pid = bounded(value.pid, 20);
    const signal = bounded(value.sig, 8);
    if (pid === "") return [];
    return [{
      id: `omarchy:crash:${pid}:${occurredAt}`,
      source: "io.omarchy.crash-reports",
      category: "application-crashes",
      app: "Crash Reports",
      title: `${executable} crashed`,
      body: bounded(`${signalName(signal)}${pid ? ` · PID ${pid}` : ""}`, 300),
      urgency: "normal",
      occurredAt
    }];
  }).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 50);
}

export function parseOmarchyUpdates(raw: string, exitCode: number, now: Date): NativeSourceItem[] {
  if (exitCode !== 0) return [];
  const lines = raw.split(/\r?\n/u).map((line) => bounded(line, 300)).filter((line) => line !== "" && line !== "Omarchy is up to date").slice(0, 20);
  if (lines.length === 0) return [];
  const occurredAt = now.toISOString();
  return [{
    id: `omarchy:update:${dayKey(now)}:${stableHash(lines.join("\n"))}`,
    source: "io.omarchy.updates",
    category: "available-updates",
    app: "Omarchy Updates",
    title: lines.length === 1 ? "Omarchy update available" : `${lines.length} Omarchy updates available`,
    body: bounded(lines.join(" · "), 1_500),
    urgency: "normal",
    occurredAt
  }];
}

export function parsePowerSupplies(values: Array<Record<string, string>>): Omit<TelemetrySnapshot, "capturedAt" | "networkState"> {
  const batteries = values.filter((value) => String(value.type || "").toLowerCase() === "battery");
  const linePower = values.filter((value) => ["mains", "usb", "usb_c"].includes(String(value.type || "").toLowerCase()));
  const online = linePower.map((value) => Number(value.online)).filter(Number.isFinite);
  const percentages = batteries.map((value) => Number(value.capacity)).filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const states = batteries.map((value) => bounded(value.status, 40).toLowerCase()).filter(Boolean);
  return {
    ...(online.length === 0 ? {} : { onBattery: !online.some((value) => value > 0) }),
    ...(percentages.length === 0 ? {} : { batteryPercent: Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length) }),
    ...(states.length === 0 ? {} : { batteryState: states[0] })
  };
}

export function deriveTelemetryEvents(previous: TelemetrySnapshot | undefined, current: TelemetrySnapshot): NativeSourceItem[] {
  if (previous === undefined) return [];
  const events: NativeSourceItem[] = [];
  if (previous.onBattery !== undefined && current.onBattery !== undefined && previous.onBattery !== current.onBattery) {
    events.push(telemetryItem(
      "power",
      current.onBattery ? "Charger disconnected" : "Charger connected",
      current.onBattery ? "The system switched to battery power." : "The system switched to external power.",
      current.capturedAt,
      "normal"
    ));
  }
  const priorBand = batteryBand(previous.batteryPercent);
  const currentBand = batteryBand(current.batteryPercent);
  if (currentBand > priorBand) {
    const percent = current.batteryPercent ?? 0;
    events.push(telemetryItem(
      "battery",
      currentBand === 2 ? "Battery critically low" : "Battery low",
      `Battery is at ${percent}%.`,
      current.capturedAt,
      currentBand === 2 ? "critical" : "normal"
    ));
  }
  if (previous.networkState !== undefined && current.networkState !== undefined && previous.networkState !== current.networkState) {
    events.push(telemetryItem(
      "network",
      "Network connectivity changed",
      `Connectivity is now ${bounded(current.networkState, 60)}.`,
      current.capturedAt,
      current.networkState === "full" ? "low" : "normal"
    ));
  }
  return events;
}

export function parseFailedServices(raw: string, now: Date): NativeSourceItem[] {
  const occurredAt = now.toISOString();
  return raw.split(/\r?\n/u).flatMap((line): NativeSourceItem[] => {
    const service = bounded(line.trim().split(/\s+/u)[0], 180);
    if (!/^[a-zA-Z0-9@_.:-]+\.(?:service|socket|timer|path)$/u.test(service)) return [];
    return [{
      id: `omarchy:service:${service}:${dayKey(now)}`,
      source: "io.omarchy.system-telemetry",
      category: "failed-services",
      app: "System Telemetry",
      title: `${service} failed`,
      body: "A user service is in the failed state.",
      urgency: "normal",
      occurredAt
    }];
  }).slice(0, 30);
}

export function storageWarning(disk: { total: number; available: number }, now: Date): NativeSourceItem[] {
  if (!Number.isFinite(disk.total) || !Number.isFinite(disk.available) || disk.total <= 0 || disk.available < 0) return [];
  const usedPercent = Math.round((1 - Math.min(disk.available, disk.total) / disk.total) * 100);
  if (usedPercent < 85) return [];
  return [telemetryItem(
    "storage",
    usedPercent >= 95 ? "Storage critically low" : "Storage running low",
    `Root filesystem is ${usedPercent}% used.`,
    now.toISOString(),
    usedPercent >= 95 ? "critical" : "normal"
  )];
}

export function parseHerdrAgents(raw: string): HerdrAgentSnapshot[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!isObject(parsed) || !isObject(parsed.result) || !Array.isArray(parsed.result.agents)) return [];
  return parsed.result.agents.flatMap((value): HerdrAgentSnapshot[] => {
    if (!isObject(value)) return [];
    const id = bounded(isObject(value.agent_session) ? value.agent_session.value : value.pane_id, 160);
    const name = bounded(value.name || value.terminal_title_stripped || value.workspace_id || "Agent", 120);
    const status = bounded(value.agent_status, 30).toLowerCase();
    if (!id || !name || !["working", "idle", "done", "blocked", "unknown"].includes(status)) return [];
    return [{ id, name, status }];
  }).slice(0, 64);
}

export function deriveHerdrEvents(previous: HerdrAgentSnapshot[] | undefined, current: HerdrAgentSnapshot[], now: Date): NativeSourceItem[] {
  if (previous === undefined) return [];
  const before = new Map(previous.map((agent) => [agent.id, agent.status]));
  return current.flatMap((agent): NativeSourceItem[] => {
    if (before.get(agent.id) === agent.status || !["done", "blocked"].includes(agent.status)) return [];
    const blocked = agent.status === "blocked";
    return [{
      id: `omarchy:herdr:${stableHash(agent.id)}:${agent.status}:${now.toISOString()}`,
      source: "io.omarchy.herdr",
      category: blocked ? "blocked-agents" : "completed-agents",
      app: "Herdr Agents",
      title: `${agent.name} ${blocked ? "is blocked" : "finished"}`,
      body: blocked ? "A Herdr agent needs attention." : "A Herdr agent completed its current task.",
      urgency: blocked ? "normal" : "low",
      occurredAt: now.toISOString()
    }];
  }).slice(0, 64);
}

export function activeHerdrItem(agents: HerdrAgentSnapshot[], now: Date): NativeSourceItem[] {
  const active = agents.filter((agent) => agent.status === "working").slice(0, 32);
  if (active.length === 0) return [];
  return [{
    id: `omarchy:herdr:active:${dayKey(now)}:${stableHash(active.map((agent) => agent.id).sort().join("|"))}`,
    source: "io.omarchy.herdr",
    category: "active-agents",
    app: "Herdr Agents",
    title: `${active.length} Herdr ${active.length === 1 ? "agent" : "agents"} working`,
    body: bounded(active.map((agent) => agent.name).join(" · "), 1_000),
    urgency: "low",
    occurredAt: now.toISOString()
  }];
}

const systemDependencies: NativeSourceDependencies = {
  run: runCommand,
  now: () => new Date(),
  readPowerSupplies,
  rootDisk: () => {
    const value = statfsSync("/");
    return { total: Number(value.blocks) * Number(value.bsize), available: Number(value.bavail) * Number(value.bsize) };
  }
};

function readPowerSupplies(): Array<Record<string, string>> {
  if (!existsSync(POWER_ROOT)) return [];
  let names: string[];
  try { names = readdirSync(POWER_ROOT).slice(0, 32); } catch { return []; }
  return names.map((name) => {
    const root = join(POWER_ROOT, name);
    return {
      type: readSmallFile(join(root, "type")),
      online: readSmallFile(join(root, "online")),
      capacity: readSmallFile(join(root, "capacity")),
      status: readSmallFile(join(root, "status"))
    };
  });
}

function readSmallFile(path: string): string {
  try {
    if (statSync(path).size > 1_024) return "";
    return bounded(readFileSync(path, "utf8"), 200);
  } catch { return ""; }
}

async function readNetworkState(dependencies: NativeSourceDependencies): Promise<string | undefined> {
  const response = await dependencies.run(NMCLI_COMMAND, ["-t", "-f", "CONNECTIVITY", "general"]);
  if (response.code !== 0) return undefined;
  const state = bounded(response.stdout.split(/\r?\n/u)[0], 60).toLowerCase();
  return ["none", "portal", "limited", "full", "unknown"].includes(state) ? state : undefined;
}

function runCommand(file: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolveCall) => {
    execFile(file, args, { encoding: "utf8", timeout: 15_000, maxBuffer: MAX_COMMAND_BYTES }, (error, stdout) => {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "number" ? error.code : error ? -1 : 0;
      resolveCall({ code, stdout: String(stdout || "").slice(0, MAX_COMMAND_BYTES) });
    });
  });
}

function telemetryItem(category: string, title: string, body: string, occurredAt: string, urgency: "low" | "normal" | "critical"): NativeSourceItem {
  return {
    id: `omarchy:telemetry:${category}:${occurredAt}`,
    source: "io.omarchy.system-telemetry",
    category,
    app: "System Telemetry",
    title: bounded(title, 2_000),
    body: bounded(body, 8_000),
    urgency,
    occurredAt
  };
}

function parseStoredItem(value: unknown): NativeSourceItem[] {
  if (!isObject(value)) return [];
  const occurredAt = bounded(value.occurredAt, 50);
  const urgency = value.urgency;
  if (Number.isNaN(new Date(occurredAt).getTime()) || !["low", "normal", "critical"].includes(String(urgency))) return [];
  const item: NativeSourceItem = {
    id: bounded(value.id, 240), source: bounded(value.source, 128), category: bounded(value.category, 64),
    app: bounded(value.app, 120), title: bounded(value.title, 2_000), body: bounded(value.body, 8_000),
    urgency: urgency as NativeSourceItem["urgency"], occurredAt
  };
  return item.id && item.source && item.category && item.app && item.title ? [item] : [];
}

function parseSnapshot(value: unknown): TelemetrySnapshot | undefined {
  if (!isObject(value) || typeof value.capturedAt !== "string" || Number.isNaN(new Date(value.capturedAt).getTime())) return undefined;
  return {
    capturedAt: value.capturedAt,
    ...(typeof value.onBattery === "boolean" ? { onBattery: value.onBattery } : {}),
    ...(typeof value.batteryPercent === "number" && value.batteryPercent >= 0 && value.batteryPercent <= 100 ? { batteryPercent: value.batteryPercent } : {}),
    ...(typeof value.batteryState === "string" ? { batteryState: bounded(value.batteryState, 40) } : {}),
    ...(typeof value.networkState === "string" ? { networkState: bounded(value.networkState, 60) } : {})
  };
}

function parseStoredAgents(value: unknown): HerdrAgentSnapshot[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((agent): HerdrAgentSnapshot[] => {
    if (!isObject(agent)) return [];
    const id = bounded(agent.id, 160);
    const name = bounded(agent.name, 120);
    const status = bounded(agent.status, 30);
    return id && name && ["working", "idle", "done", "blocked", "unknown"].includes(status) ? [{ id, name, status }] : [];
  }).slice(0, 64);
}

function categoryEnabled(enabled: Record<string, string[]>, source: string, category: string): boolean {
  return (enabled[source] || []).slice(0, 24).includes(category);
}
function within(raw: string, since: Date, until: Date): boolean {
  const time = new Date(raw).getTime();
  return Number.isFinite(time) && time >= since.getTime() && time <= until.getTime();
}
function deduplicate(items: NativeSourceItem[]): NativeSourceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => !seen.has(item.id) && seen.add(item.id)).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}
function coredumpTime(value: unknown): string | undefined {
  const micros = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(micros) || micros <= 0) return undefined;
  const date = new Date(Math.floor(micros / 1_000));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
function signalName(raw: string): string {
  const names: Record<string, string> = { "4": "SIGILL", "6": "SIGABRT", "7": "SIGBUS", "8": "SIGFPE", "9": "SIGKILL", "11": "SIGSEGV" };
  return names[raw] || (raw ? `Signal ${raw}` : "Process failure");
}
function batteryBand(value: number | undefined): number {
  if (value === undefined) return 0;
  return value <= 10 ? 2 : value <= 20 ? 1 : 0;
}
function dayKey(date: Date): string { return date.toISOString().slice(0, 10); }
function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (const character of value) hash = Math.imul(hash ^ character.codePointAt(0)!, 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function bounded(value: unknown, length: number): string {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").trim().slice(0, length);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
