import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { attentionEntityKeys, groupAttentionItems } from "./intelligence.js";
import type {
  AttentionItem,
  AttentionCalibration,
  AttentionMemoryKind,
  AttentionMemoryNode,
  AttentionMemoryStatus,
  AttentionPreferenceHint,
  AttentionThread,
  AttentionTimelineItem,
  AttentionTimelineMode,
  AttentionTimelinePage,
  Digest
} from "./types.js";

export const ATTENTION_MEMORY_MAX_EPISODES = 512;
export const ATTENTION_MEMORY_RETENTION_DAYS = 90;
export const ATTENTION_MEMORY_MAX_FILE_BYTES = 512 * 1024;
export const ATTENTION_MEMORY_MAX_MODEL_BYTES = 48 * 1024;
export const ATTENTION_TIMELINE_MAX_BYTES = 64 * 1024;
export const ATTENTION_TIMELINE_MAX_ITEMS = 40;
export const ATTENTION_TIMELINE_MAX_THREADS = 16;

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
  action: z.enum(["ignore", "hold", "digest", "notify", "read", "handoff", "cancelled", "useful", "not-useful"]).optional(),
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

export type AttentionTimelineRequest = {
  mode: AttentionTimelineMode;
  threadId?: string;
  cursor?: string;
  limit?: number;
};

export class AttentionMemory {
  readonly #path: string;
  #state: MemoryState = { version: 1, episodes: [] };
  readonly #knownNodes = new Map<string, AttentionMemoryNode>();
  readonly #knownRanges = new Map<string, [number, number]>();
  readonly #knownSources = new Map<string, SourceReference[]>();
  readonly #knownEpisodeIds = new Map<string, string[]>();

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

  recordDecision(action: "ignore" | "hold" | "digest" | "notify", reason: string, items: AttentionItem[], subject?: string, now = new Date()): void {
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

  recordOutcome(action: "read" | "handoff" | "cancelled" | "useful" | "not-useful", subject: string, sourceIds: string[], digestId?: string, now = new Date()): void {
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

  preferenceHints(items: AttentionItem[], now = new Date()): AttentionPreferenceHint[] {
    const groups = groupAttentionItems(items).slice(0, 40);
    const cutoff = now.getTime() - ATTENTION_MEMORY_RETENTION_DAYS * 86_400_000;
    const outcomes = this.#ordered().filter((episode) => episode.kind === "outcome"
      && Date.parse(episode.occurredAt) >= cutoff
      && ["read", "handoff", "useful", "not-useful"].includes(episode.action ?? ""));
    return groups.flatMap((group) => {
      const apps = new Set(group.items.map((item) => item.app.trim().toLowerCase()));
      const entities = new Set(group.items.flatMap(attentionEntityKeys));
      const related = outcomes.filter((episode) => episode.sources.some((source) => apps.has(source.app.trim().toLowerCase()))
        || attentionEntityKeys({
          id: episode.id, source: "omadigest.memory", app: "OmaDigest Memory",
          title: episode.subject, body: episode.summary, urgency: "low", occurredAt: episode.occurredAt
        }).some((entity) => entities.has(entity)));
      if (related.length === 0) return [];
      const useful = related.filter((episode) => episode.action === "useful").length;
      const handoff = related.filter((episode) => episode.action === "handoff").length;
      const read = related.filter((episode) => episode.action === "read").length;
      const notUseful = related.filter((episode) => episode.action === "not-useful").length;
      const positive = useful * 3 + handoff * 3 + read;
      const negative = notUseful * 3;
      if (positive === negative) return [];
      const signal = positive > negative ? "surface" as const : "defer" as const;
      const reason = signal === "surface"
        ? `${useful + handoff} strong positive and ${read} read outcome${read === 1 ? "" : "s"} on related attention`
        : `${notUseful} related digest${notUseful === 1 ? " was" : "s were"} marked not useful`;
      return [{ subject: group.subject, signal, reason, sampleSize: related.length }];
    }).sort((left, right) => right.sampleSize - left.sampleSize).slice(0, 12);
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

  thread(threadId: string, kinds: AttentionMemoryKind[] = [], limit = 12): AttentionMemoryNode[] {
    if (!/^thread-[a-f0-9]{24}$/u.test(threadId)) return [];
    const episodes = this.#ordered();
    const threadIndex = buildThreadIndex(episodes);
    const allowedKinds = new Set(kinds.slice(0, 4));
    const maximum = Math.max(1, Math.min(16, limit));
    const indexes = episodes.map((episode, index) => ({ episode, index }))
      .filter(({ episode }) => threadIndex.get(episode.id)?.id === threadId
        && (allowedKinds.size === 0 || allowedKinds.has(episode.kind)))
      .slice(-maximum).reverse();
    return boundedNodes(indexes.map(({ index }) => this.#node(episodes, index, index + 1)));
  }

  zoom(nodeId: string): AttentionMemoryNode[] {
    const knownIds = this.#knownEpisodeIds.get(nodeId);
    const episodes = knownIds === undefined
      ? this.#ordered()
      : this.#ordered().filter((episode) => knownIds.includes(episode.id));
    const range = knownIds === undefined ? this.#knownRanges.get(nodeId) : [0, episodes.length] as [number, number];
    if (range === undefined || range[1] - range[0] <= 1) return [];
    const midpoint = Math.floor((range[0] + range[1]) / 2);
    return boundedNodes([
      this.#node(episodes, range[0], midpoint),
      this.#node(episodes, midpoint, range[1])
    ]);
  }

  timeline(request: AttentionTimelineRequest): AttentionTimelinePage {
    const episodes = this.#ordered();
    const threadIndex = buildThreadIndex(episodes);
    const threads = this.#threads(episodes, threadIndex);
    const selectedThreadId = request.threadId?.trim();
    if (request.mode === "memory") {
      const selectedEpisodes = selectedThreadId === undefined
        ? episodes
        : episodes.filter((episode) => threadIndex.get(episode.id)?.id === selectedThreadId);
      const nodes = this.#coverEpisodes(selectedEpisodes, Math.max(1, Math.min(24, request.limit ?? 16))).reverse();
      return {
        mode: "memory",
        items: boundedTimelineItems(nodes.map((node) => this.#timelineNode(node, selectedEpisodes, threadIndex))),
        threads,
        hasMore: false,
        ...(selectedThreadId === undefined ? {} : { selectedThreadId })
      };
    }

    const cursor = parseTimelineCursor(request.cursor);
    if (request.cursor !== undefined && cursor === undefined) return {
      mode: "events", items: [], threads, hasMore: false,
      ...(selectedThreadId === undefined ? {} : { selectedThreadId })
    };
    const limit = Math.max(1, Math.min(ATTENTION_TIMELINE_MAX_ITEMS, request.limit ?? 24));
    const matching = [...episodes].reverse().filter((episode) => {
      if (selectedThreadId !== undefined && threadIndex.get(episode.id)?.id !== selectedThreadId) return false;
      return cursor === undefined || compareEpisodeToCursor(episode, cursor) < 0;
    });
    const candidates = matching.slice(0, limit + 1);
    const items = boundedTimelineItems(candidates.slice(0, limit).map((episode) =>
      episodeTimelineItem(episode, threadIndex.get(episode.id)!)));
    const last = items.at(-1);
    return {
      mode: "events",
      items,
      threads,
      hasMore: candidates.length > items.length,
      ...(last === undefined || candidates.length <= items.length ? {} : { nextCursor: timelineCursor(last.to, last.id) }),
      ...(selectedThreadId === undefined ? {} : { selectedThreadId })
    };
  }

  timelineZoom(nodeId: string): AttentionTimelineItem[] {
    const episodes = this.#ordered();
    const threadIndex = buildThreadIndex(episodes);
    const children = this.zoom(nodeId).reverse();
    return boundedTimelineItems(children.map((node) => this.#timelineNode(node, episodes, threadIndex)));
  }

  threadForSourceIds(sourceIds: string[]): { id: string; label: string } | undefined {
    return this.threadsForSourceIds(sourceIds, 1)[0];
  }

  threadsForSourceIds(sourceIds: string[], limit = 16): Array<{ id: string; label: string }> {
    const wanted = new Set(sourceIds.slice(0, 50));
    if (wanted.size === 0) return [];
    const episodes = this.#ordered();
    const threadIndex = buildThreadIndex(episodes);
    const result: Array<{ id: string; label: string }> = [];
    const seen = new Set<string>();
    for (const episode of [...episodes].reverse()) {
      if (!episode.sources.some((source) => wanted.has(source.id))) continue;
      const thread = threadIndex.get(episode.id)!;
      if (seen.has(thread.id)) continue;
      result.push(thread);
      seen.add(thread.id);
      if (result.length >= Math.max(1, Math.min(16, limit))) break;
    }
    return result;
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

  calibration(): AttentionCalibration {
    const episodes = this.#ordered();
    const outcomes = episodes.filter((episode) => episode.kind === "outcome");
    const threadIndex = buildThreadIndex(episodes);
    const grouped = new Map<string, MemoryEpisode[]>();
    for (const episode of outcomes) {
      const threadId = threadIndex.get(episode.id)!.id;
      grouped.set(threadId, [...(grouped.get(threadId) ?? []), episode]);
    }
    const subjects = [...grouped.entries()].map(([threadId, entries]) => {
      const latest = entries.at(-1)!;
      const score = entries.reduce((total, episode) => total
        + (episode.action === "useful" || episode.action === "handoff" ? 3
          : episode.action === "read" ? 1 : episode.action === "not-useful" ? -3 : 0), 0);
      return {
        threadId,
        label: threadIndex.get(latest.id)!.label,
        signal: score > 0 ? "surface" as const : score < 0 ? "defer" as const : "neutral" as const,
        sampleSize: entries.length,
        lastAt: latest.occurredAt
      };
    }).sort((left, right) => right.sampleSize - left.sampleSize || right.lastAt.localeCompare(left.lastAt)).slice(0, 6);
    return {
      outcomeCount: outcomes.length,
      readCount: outcomes.filter((episode) => episode.action === "read").length,
      handoffCount: outcomes.filter((episode) => episode.action === "handoff").length,
      usefulCount: outcomes.filter((episode) => episode.action === "useful").length,
      notUsefulCount: outcomes.filter((episode) => episode.action === "not-useful").length,
      subjects
    };
  }

  #coverEpisodes(episodes: MemoryEpisode[], limit: number): AttentionMemoryNode[] {
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

  #timelineNode(
    node: AttentionMemoryNode,
    episodes: MemoryEpisode[],
    threadIndex: Map<string, ThreadDescriptor>
  ): AttentionTimelineItem {
    const knownIds = new Set(this.#knownEpisodeIds.get(node.id) ?? []);
    const selected = knownIds.size === 0 ? [] : episodes.filter((episode) => knownIds.has(episode.id));
    const threadIds = new Set(selected.map((episode) => threadIndex.get(episode.id)?.id));
    const thread = selected[0] === undefined || threadIds.size !== 1 ? undefined : threadIndex.get(selected[0].id);
    const sources = uniqueSources(selected.flatMap((episode) => episode.sources));
    const single = selected.length === 1 ? selected[0] : undefined;
    return {
      id: node.id,
      kind: single?.kind ?? "summary",
      subject: node.subject,
      summary: single === undefined
        ? bounded(selected.slice(-4).map((episode) => `${episode.subject}: ${timelineSummary(episode)}`).join("; "), 1_200)
        : timelineSummary(single),
      from: node.from,
      to: node.to,
      episodeCount: node.episodeCount,
      sourceCount: sources.length,
      applications: [...new Set(sources.map((source) => source.app))].slice(0, 8),
      ...(thread === undefined ? {} : { threadId: thread.id, threadLabel: thread.label }),
      ...(single?.action === undefined ? {} : { action: single.action }),
      ...(single?.digestId === undefined ? {} : { digestId: single.digestId }),
      memoryNodeId: node.id,
      expandable: node.episodeCount > 1
    };
  }

  #threads(episodes: MemoryEpisode[], threadIndex: Map<string, ThreadDescriptor>): AttentionThread[] {
    const grouped = new Map<string, { label: string; episodes: MemoryEpisode[] }>();
    for (const episode of episodes) {
      const thread = threadIndex.get(episode.id)!;
      const current = grouped.get(thread.id) ?? { label: thread.label, episodes: [] };
      current.label = episode.subject;
      current.episodes.push(episode);
      grouped.set(thread.id, current);
    }
    return [...grouped.entries()].map(([id, value]) => {
      const ordered = [...value.episodes].sort((left, right) => compareEpisodes(left, right));
      const last = ordered.at(-1)!;
      const sources = uniqueSources(ordered.flatMap((episode) => episode.sources));
      return {
        id,
        label: bounded(value.label, 120),
        episodeCount: ordered.length,
        sourceCount: sources.length,
        applications: [...new Set(sources.map((source) => source.app))].slice(0, 6),
        lastAt: last.occurredAt,
        ...(last.action === undefined ? {} : { lastAction: last.action })
      };
    }).sort((left, right) => right.lastAt.localeCompare(left.lastAt))
      .slice(0, ATTENTION_TIMELINE_MAX_THREADS);
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
    return [...this.#state.episodes].sort(compareEpisodes);
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
    this.#knownEpisodeIds.set(node.id, selected.map((episode) => episode.id));
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
    this.#knownEpisodeIds.clear();
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

type ThreadDescriptor = { id: string; label: string };

function episodeTimelineItem(episode: MemoryEpisode, thread: ThreadDescriptor): AttentionTimelineItem {
  const sources = uniqueSources(episode.sources);
  return {
    id: episode.id,
    kind: episode.kind,
    subject: episode.subject,
    summary: timelineSummary(episode),
    from: episode.occurredAt,
    to: episode.occurredAt,
    episodeCount: 1,
    sourceCount: sources.length,
    applications: [...new Set(sources.map((source) => source.app))].slice(0, 8),
    threadId: thread.id,
    threadLabel: thread.label,
    ...(episode.action === undefined ? {} : { action: episode.action }),
    ...(episode.digestId === undefined ? {} : { digestId: episode.digestId }),
    expandable: false
  };
}

function episodeAliases(episode: MemoryEpisode): string[] {
  const entities = attentionEntityKeys({
    id: episode.id,
    source: episode.sources[0]?.source ?? "omadigest.memory",
    app: episode.sources[0]?.app ?? "OmaDigest Memory",
    title: episode.subject,
    body: episode.summary,
    contentAvailable: true,
    urgency: "low",
    occurredAt: episode.occurredAt
  });
  const work = entities.filter((entity) => entity.startsWith("work:")).slice(0, 4);
  const semantic = work.length > 0 ? work : entities.filter((entity) =>
    entity.startsWith("cve:") || entity.startsWith("ref:") || entity.startsWith("repo:")).slice(0, 4);
  const sourceAliases = episode.sources.length === 1 ? [`source:${episode.sources[0]!.id}`] : [];
  const subject = `subject:${episode.subject.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, "-").replaceAll(/^-|-$/gu, "").slice(0, 120)}`;
  return [...semantic, ...sourceAliases, ...(semantic.length === 0 ? [subject] : [])];
}

function timelineSummary(episode: MemoryEpisode): string {
  if (episode.action === undefined) return episode.summary;
  const prefix = `${episode.action}:`;
  return episode.summary.toLowerCase().startsWith(prefix)
    ? episode.summary.slice(prefix.length).trim() || episode.subject
    : episode.summary;
}

function buildThreadIndex(episodes: MemoryEpisode[]): Map<string, ThreadDescriptor> {
  const parent = new Map<string, string>();
  const aliasesByEpisode = new Map<string, string[]>();
  const find = (value: string): string => {
    const current = parent.get(value);
    if (current === undefined) { parent.set(value, value); return value; }
    if (current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };
  for (const episode of episodes) {
    const aliases = episodeAliases(episode);
    aliasesByEpisode.set(episode.id, aliases);
    for (const alias of aliases) find(alias);
    for (const alias of aliases.slice(1)) union(aliases[0]!, alias);
  }
  const latestByRoot = new Map<string, MemoryEpisode>();
  const earliestByRoot = new Map<string, MemoryEpisode>();
  const aliasesByRoot = new Map<string, Set<string>>();
  for (const episode of episodes) {
    const aliases = aliasesByEpisode.get(episode.id)!;
    const root = find(aliases[0]!);
    const knownAliases = aliasesByRoot.get(root) ?? new Set<string>();
    for (const alias of aliases) knownAliases.add(alias);
    aliasesByRoot.set(root, knownAliases);
    if (!earliestByRoot.has(root)) earliestByRoot.set(root, episode);
    latestByRoot.set(root, episode);
  }
  const descriptors = new Map<string, ThreadDescriptor>();
  for (const root of aliasesByRoot.keys()) {
    const earliest = earliestByRoot.get(root)!;
    const ranked = [...aliasesByEpisode.get(earliest.id)!]
      .sort((left, right) => aliasRank(left) - aliasRank(right) || left.localeCompare(right));
    descriptors.set(root, {
      id: `thread-${digestId(ranked[0] ?? root)}`,
      label: bounded(latestByRoot.get(root)?.subject ?? "Attention thread", 120)
    });
  }
  return new Map(episodes.map((episode) => {
    const aliases = aliasesByEpisode.get(episode.id)!;
    return [episode.id, descriptors.get(find(aliases[0]!))!] as const;
  }));
}

function aliasRank(value: string): number {
  if (value.startsWith("work:")) return 0;
  if (value.startsWith("cve:")) return 1;
  if (value.startsWith("ref:")) return 2;
  if (value.startsWith("repo:")) return 3;
  if (value.startsWith("source:")) return 4;
  return 5;
}

function compareEpisodes(left: MemoryEpisode, right: MemoryEpisode): number {
  return left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
}

function timelineCursor(occurredAt: string, id: string): string {
  return Buffer.from(JSON.stringify([occurredAt, id]), "utf8").toString("base64url");
}

function parseTimelineCursor(value: string | undefined): { occurredAt: string; id: string } | undefined {
  if (value === undefined || value.length > 320) return undefined;
  try {
    const parsed = z.tuple([z.string().datetime(), z.string().min(1).max(100)])
      .safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? { occurredAt: parsed.data[0], id: parsed.data[1] } : undefined;
  } catch { return undefined; }
}

function compareEpisodeToCursor(episode: MemoryEpisode, cursor: { occurredAt: string; id: string }): number {
  return episode.occurredAt.localeCompare(cursor.occurredAt) || episode.id.localeCompare(cursor.id);
}

function boundedTimelineItems(items: AttentionTimelineItem[]): AttentionTimelineItem[] {
  const result: AttentionTimelineItem[] = [];
  let bytes = 2;
  for (const item of items.slice(0, ATTENTION_TIMELINE_MAX_ITEMS)) {
    const presented = {
      ...item,
      subject: item.subject.slice(0, 200),
      summary: item.summary.slice(0, 600),
      applications: item.applications.slice(0, 8)
    };
    const size = Buffer.byteLength(JSON.stringify(presented), "utf8") + 1;
    if (bytes + size > ATTENTION_TIMELINE_MAX_BYTES) break;
    result.push(presented);
    bytes += size;
  }
  return result;
}

function countSummaryNodes(episodes: number): number {
  return episodes <= 1 ? 0 : episodes - 1;
}
