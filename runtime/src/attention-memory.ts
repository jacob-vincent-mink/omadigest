import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { groupAttentionItems } from "./intelligence.js";
import type {
  AttentionItem,
  AttentionMemoryKind,
  AttentionMemoryNode,
  AttentionMemoryStatus,
  Digest
} from "./types.js";

export const ATTENTION_MEMORY_MAX_EPISODES = 512;
export const ATTENTION_MEMORY_RETENTION_DAYS = 90;
export const ATTENTION_MEMORY_MAX_FILE_BYTES = 512 * 1024;
export const ATTENTION_MEMORY_MAX_MODEL_BYTES = 48 * 1024;

const sourceSchema = z.object({
  id: z.string().min(1).max(200),
  source: z.string().min(1).max(80),
  app: z.string().min(1).max(120)
}).strict();
const episodeSchema = z.object({
  id: z.string().min(1).max(100),
  kind: z.enum(["evidence", "decision", "digest", "outcome"]),
  occurredAt: z.string().datetime(),
  subject: z.string().min(1).max(200),
  summary: z.string().min(1).max(1_200),
  sources: z.array(sourceSchema).max(50),
  action: z.enum(["hold", "digest", "notify", "read", "handoff", "cancelled"]).optional(),
  digestId: z.string().uuid().optional()
}).strict();
const stateSchema = z.object({
  version: z.literal(1),
  episodes: z.array(episodeSchema).max(ATTENTION_MEMORY_MAX_EPISODES)
}).strict();

type SourceReference = z.infer<typeof sourceSchema>;
type MemoryEpisode = z.infer<typeof episodeSchema>;
type MemoryState = z.infer<typeof stateSchema>;

export type AttentionMemorySearch = {
  query: string;
  subject?: string;
  kinds?: AttentionMemoryKind[];
  sinceDays?: number;
  limit?: number;
};

export class AttentionMemory {
  readonly #path: string;
  #state: MemoryState = { version: 1, episodes: [] };
  readonly #knownNodes = new Map<string, AttentionMemoryNode>();
  readonly #knownRanges = new Map<string, [number, number]>();
  readonly #knownSources = new Map<string, SourceReference[]>();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const state = env.XDG_STATE_HOME?.startsWith("/")
      ? env.XDG_STATE_HOME
      : env.HOME?.startsWith("/") ? join(env.HOME, ".local", "state") : "/tmp";
    this.#path = join(state, "omadigest", "attention-memory.json");
    this.#load(new Date());
  }

  recordEvidence(items: AttentionItem[], now = new Date()): void {
    const groups = groupAttentionItems(items).slice(0, 80);
    for (const group of groups) {
      const sources = sourceReferences(group.items);
      if (sources.length === 0) continue;
      const fingerprint = sources.map((source) => source.id).sort().join("\u0000");
      const episode: MemoryEpisode = {
        id: `evidence-${digestId(fingerprint)}`,
        kind: "evidence",
        occurredAt: group.items.map((item) => item.occurredAt).sort().at(-1) ?? now.toISOString(),
        subject: bounded(group.subject || group.items[0]?.title || "Attention update", 200),
        summary: bounded(group.items.map((item) => {
          const detail = [item.title.trim(), item.body.trim()].filter(Boolean).join(" — ");
          return `${item.app}: ${detail}`;
        }).join("; "), 1_200),
        sources
      };
      this.#upsert(episode, false);
    }
    if (groups.length > 0) this.#save(now);
  }

  recordDecision(action: "hold" | "digest" | "notify", reason: string, items: AttentionItem[], subject?: string, now = new Date()): void {
    const sources = sourceReferences(items);
    if (sources.length === 0) return;
    this.#upsert({
      id: `decision-${randomUUID()}`,
      kind: "decision",
      occurredAt: now.toISOString(),
      subject: bounded(subject || inferredSubject(items), 200),
      summary: bounded(`${action}: ${reason}`, 1_200),
      sources,
      action
    });
  }

  recordDigest(digest: Digest, items: AttentionItem[]): void {
    const sources = sourceReferences(items);
    if (sources.length === 0) return;
    const headlines = digest.sections.flatMap((section) => section.entries.map((entry) => entry.headline)).slice(0, 12);
    this.#upsert({
      id: `digest-${digest.id}`,
      kind: "digest",
      occurredAt: digest.generatedAt,
      subject: bounded(digest.title, 200),
      summary: bounded([digest.title, ...headlines].join("; "), 1_200),
      sources,
      action: "digest",
      digestId: digest.id
    });
  }

  recordOutcome(action: "read" | "handoff" | "cancelled", subject: string, sourceIds: string[], digestId?: string, now = new Date()): void {
    const sourceSet = new Set(sourceIds.slice(0, 50));
    const sources = this.#state.episodes.flatMap((episode) => episode.sources)
      .filter((source) => sourceSet.has(source.id));
    const unique = uniqueSources(sources);
    if (unique.length === 0) return;
    this.#upsert({
      id: `outcome-${randomUUID()}`,
      kind: "outcome",
      occurredAt: now.toISOString(),
      subject: bounded(subject || "Attention outcome", 200),
      summary: bounded(`${action}: ${subject || "attention item"}`, 1_200),
      sources: unique,
      action,
      ...(digestId === undefined ? {} : { digestId })
    });
  }

  cover(limit = 24): AttentionMemoryNode[] {
    const episodes = this.#ordered();
    if (episodes.length === 0) return [];
    const maximum = Math.max(1, Math.min(48, limit));
    const ranges: Array<[number, number]> = [[0, episodes.length]];
    while (ranges.length < maximum) {
      let selected = -1;
      let selectedScore = -1;
      for (let index = 0; index < ranges.length; index += 1) {
        const [lo, hi] = ranges[index]!;
        if (hi - lo <= 1) continue;
        const recency = hi / episodes.length;
        const score = (hi - lo) * (1 + recency * 2);
        if (score >= selectedScore) { selected = index; selectedScore = score; }
      }
      if (selected < 0) break;
      const [lo, hi] = ranges[selected]!;
      const midpoint = Math.floor((lo + hi) / 2);
      ranges.splice(selected, 1, [lo, midpoint], [midpoint, hi]);
    }
    return boundedNodes(ranges.map(([lo, hi]) => this.#node(episodes, lo, hi)));
  }

  search(request: AttentionMemorySearch, now = new Date()): AttentionMemoryNode[] {
    const query = bounded(request.query.trim().toLowerCase(), 200);
    if (query === "") return [];
    const terms = [...new Set(query.split(/[^\p{L}\p{N}#._/-]+/u).filter((term) => term.length > 1))].slice(0, 12);
    const subject = (request.subject ?? "").trim().toLowerCase().replaceAll(/\s+/gu, " ").slice(0, 200);
    const kinds = new Set((request.kinds ?? []).slice(0, 4));
    const sinceDays = Math.max(1, Math.min(ATTENTION_MEMORY_RETENTION_DAYS, request.sinceDays ?? ATTENTION_MEMORY_RETENTION_DAYS));
    const cutoff = now.getTime() - sinceDays * 86_400_000;
    const limit = Math.max(1, Math.min(16, request.limit ?? 8));
    const episodes = this.#ordered();
    const scored = episodes.flatMap((episode, index) => {
      if (Date.parse(episode.occurredAt) < cutoff) return [];
      if (kinds.size > 0 && !kinds.has(episode.kind)) return [];
      if (subject !== "" && !episode.subject.toLowerCase().includes(subject)) return [];
      const haystack = `${episode.subject}\n${episode.summary}\n${episode.sources.map((source) => `${source.app} ${source.source}`).join(" ")}`.toLowerCase();
      const matched = terms.filter((term) => haystack.includes(term)).length;
      if (terms.length > 0 && matched === 0) return [];
      const recency = index / Math.max(1, episodes.length - 1);
      return [{ episode, index, score: matched * 10 + recency }];
    }).sort((left, right) => right.score - left.score).slice(0, limit);
    return boundedNodes(scored.map(({ index }) => this.#node(episodes, index, index + 1)));
  }

  zoom(nodeId: string): AttentionMemoryNode[] {
    const episodes = this.#ordered();
    const range = this.#knownRanges.get(nodeId);
    if (range === undefined || range[1] - range[0] <= 1) return [];
    const midpoint = Math.floor((range[0] + range[1]) / 2);
    return boundedNodes([
      this.#node(episodes, range[0], midpoint),
      this.#node(episodes, midpoint, range[1])
    ]);
  }

  byIds(ids: string[]): AttentionItem[] {
    const wanted = new Set(ids.slice(0, 50));
    if (wanted.size === 0) return [];
    const episodes = this.#ordered();
    const nodes = [...wanted].flatMap((id) => {
      const node = this.#knownNodes.get(id) ?? this.#restoreNode(episodes, id);
      return node === undefined ? [] : [node];
    });
    return nodes.map((node) => ({
      id: node.id,
      source: "omadigest.memory",
      app: "OmaDigest Memory",
      title: node.subject,
      body: node.summary,
      category: "history",
      intent: "update",
      contentAvailable: true,
      urgency: "low",
      occurredAt: node.to,
      memoryProvenance: this.#knownSources.get(node.id) ?? []
    }));
  }

  status(): AttentionMemoryStatus {
    const episodes = this.#ordered();
    return {
      episodeCount: episodes.length,
      summaryCount: countSummaryNodes(episodes.length),
      ...(episodes[0] === undefined ? {} : { oldestAt: episodes[0].occurredAt }),
      ...(episodes.at(-1) === undefined ? {} : { newestAt: episodes.at(-1)!.occurredAt })
    };
  }

  applyNotificationPolicy(allowed: (app: string) => boolean): void {
    this.#state.episodes = this.#state.episodes.filter((episode) =>
      episode.sources.every((source) => source.source !== "notifications" || allowed(source.app)));
    this.#clearKnownNodes();
    this.#save(new Date());
  }

  clearNotifications(): void {
    this.#state.episodes = this.#state.episodes.filter((episode) =>
      episode.sources.every((source) => source.source !== "notifications"));
    this.#clearKnownNodes();
    this.#save(new Date());
  }

  deleteDigest(digestId: string): void {
    this.#state.episodes = this.#state.episodes.filter((episode) => episode.digestId !== digestId);
    this.#clearKnownNodes();
    this.#save(new Date());
  }

  clearDigests(): void {
    this.#state.episodes = this.#state.episodes.filter((episode) => episode.kind !== "digest" && episode.digestId === undefined);
    this.#clearKnownNodes();
    this.#save(new Date());
  }

  clear(): void {
    this.#state = { version: 1, episodes: [] };
    this.#clearKnownNodes();
    rmSync(this.#path, { force: true });
  }

  #upsert(episode: MemoryEpisode, save = true): void {
    const parsed = episodeSchema.parse(episode);
    const replacing = this.#state.episodes.some((candidate) => candidate.id === parsed.id);
    this.#state.episodes = this.#state.episodes.filter((candidate) => candidate.id !== parsed.id);
    this.#state.episodes.push(parsed);
    if (replacing) this.#clearKnownNodes();
    if (save) this.#save(new Date(parsed.occurredAt));
  }

  #ordered(): MemoryEpisode[] {
    return [...this.#state.episodes].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  }

  #node(episodes: MemoryEpisode[], lo: number, hi: number): AttentionMemoryNode {
    const selected = episodes.slice(lo, hi);
    const first = selected[0]!;
    const last = selected.at(-1)!;
    const sourceIds = [...new Set(selected.flatMap((episode) => episode.sources.map((source) => source.id)))].slice(0, 50);
    const sources = uniqueSources(selected.flatMap((episode) => episode.sources));
    const kinds = [...new Set(selected.map((episode) => episode.kind))];
    const subjects = [...new Set(selected.map((episode) => episode.subject))];
    const subject = subjects.length === 1 ? subjects[0]! : `${selected.length} remembered attention moments`;
    const summary = selected.length === 1 ? first.summary : bounded(
      selected.slice(-4).map((episode) => `${episode.subject}: ${episode.summary}`).join("; "), 1_200);
    const signature = selected.map((episode) => episode.id).join("\u0000");
    const node: AttentionMemoryNode = {
      id: `memory-${selected.length === 1 ? "episode" : "summary"}-${lo}-${hi}-${digestId(signature)}`,
      kind: selected.length === 1 ? "episode" : "summary",
      episodeKinds: kinds,
      subject,
      summary,
      from: first.occurredAt,
      to: last.occurredAt,
      episodeCount: selected.length,
      sourceIds
    };
    this.#knownNodes.set(node.id, node);
    this.#knownRanges.set(node.id, [lo, hi]);
    this.#knownSources.set(node.id, sources);
    return node;
  }

  #restoreNode(episodes: MemoryEpisode[], id: string): AttentionMemoryNode | undefined {
    const parsed = /^memory-(?:episode|summary)-(\d+)-(\d+)-[a-f0-9]{24}$/u.exec(id);
    if (parsed === null) return undefined;
    const lo = Number(parsed[1]);
    const hi = Number(parsed[2]);
    if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo < 0 || hi <= lo || hi > episodes.length) return undefined;
    const node = this.#node(episodes, lo, hi);
    return node.id === id ? node : undefined;
  }

  #load(now: Date): void {
    try {
      if (!existsSync(this.#path) || statSync(this.#path).size > ATTENTION_MEMORY_MAX_FILE_BYTES) return;
      this.#state = stateSchema.parse(JSON.parse(readFileSync(this.#path, "utf8")));
      this.#prune(now);
    } catch { this.#state = { version: 1, episodes: [] }; }
  }

  #prune(now: Date): void {
    const cutoff = now.getTime() - ATTENTION_MEMORY_RETENTION_DAYS * 86_400_000;
    const before = this.#state.episodes.map((episode) => episode.id).join("\u0000");
    this.#state.episodes = this.#ordered().filter((episode) => Date.parse(episode.occurredAt) >= cutoff)
      .slice(-ATTENTION_MEMORY_MAX_EPISODES);
    if (before !== this.#state.episodes.map((episode) => episode.id).join("\u0000")) this.#clearKnownNodes();
  }

  #save(now: Date): void {
    this.#prune(now);
    let serialized = `${JSON.stringify(this.#state)}\n`;
    let removed = false;
    while (Buffer.byteLength(serialized, "utf8") > ATTENTION_MEMORY_MAX_FILE_BYTES && this.#state.episodes.length > 0) {
      this.#state.episodes.shift();
      removed = true;
      serialized = `${JSON.stringify(this.#state)}\n`;
    }
    if (removed) this.#clearKnownNodes();
    mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    writeFileSync(temporary, serialized, { mode: 0o600 });
    renameSync(temporary, this.#path);
  }

  #clearKnownNodes(): void {
    this.#knownNodes.clear();
    this.#knownRanges.clear();
    this.#knownSources.clear();
  }
}

function sourceReferences(items: AttentionItem[]): SourceReference[] {
  return uniqueSources(items.slice(0, 50).flatMap((item) => {
    const provenance = z.array(sourceSchema).max(50).safeParse(
      (item as AttentionItem & { memoryProvenance?: unknown }).memoryProvenance
    );
    return provenance.success && provenance.data.length > 0
      ? provenance.data
      : [{ id: item.id, source: item.source, app: item.app }];
  }));
}

function uniqueSources(sources: SourceReference[]): SourceReference[] {
  const byId = new Map<string, SourceReference>();
  for (const source of sources.slice(0, 200)) byId.set(source.id, sourceSchema.parse(source));
  return [...byId.values()].slice(0, 50);
}

function inferredSubject(items: AttentionItem[]): string {
  return groupAttentionItems(items)[0]?.subject || items[0]?.title || items[0]?.app || "Attention update";
}

function bounded(value: string, maximum: number): string {
  return value.replaceAll(/\s+/gu, " ").trim().slice(0, maximum) || "Attention update";
}

function digestId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function boundedNodes(nodes: AttentionMemoryNode[]): AttentionMemoryNode[] {
  const result: AttentionMemoryNode[] = [];
  let bytes = 2;
  for (const node of nodes) {
    const presented = { ...node, summary: node.summary.slice(0, 600), sourceIds: node.sourceIds.slice(0, 4) };
    const size = Buffer.byteLength(JSON.stringify(presented), "utf8") + 1;
    if (bytes + size > ATTENTION_MEMORY_MAX_MODEL_BYTES) break;
    result.push(presented);
    bytes += size;
  }
  return result;
}

function countSummaryNodes(episodes: number): number {
  return episodes <= 1 ? 0 : episodes - 1;
}
