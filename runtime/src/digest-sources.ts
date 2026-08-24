import type { AttentionItem, Digest, DigestEntry, DigestSource } from "./types.js";

export const MAX_DIGEST_SOURCES = 64;
export const MAX_DIGEST_SOURCE_BYTES = 96 * 1024;
const MAX_URLS_PER_ITEM = 4;

export function safeDigestSourceUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== ""
      || Buffer.byteLength(raw, "utf8") > 2_048) return undefined;
    return url.href.slice(0, 2_048);
  } catch { return undefined; }
}

export function attachDigestSources(digest: Digest, evidence: AttentionItem[]): Digest {
  const cited = new Set(digest.sections.flatMap((section) => section.entries.flatMap((entry) => entry.sourceIds)).slice(0, 200));
  const sources = boundedSources(evidence.filter((item) => cited.has(item.id)).flatMap(sourceRecords));
  return sources.length === 0 ? digest : { ...digest, sources };
}

export function resolveDigestEntrySources(
  digest: Digest,
  entry: DigestEntry,
  fallbackEvidence: AttentionItem[] = []
): DigestSource[] {
  const stored = digest.sources ?? [];
  const fallback = fallbackEvidence.flatMap(sourceRecords);
  const results: DigestSource[] = [];
  for (const sourceId of [...new Set(entry.sourceIds)].slice(0, 20)) {
    const matches = stored.filter((source) => source.sourceId === sourceId);
    const recovered = matches.length > 0 ? matches : fallback.filter((source) => source.sourceId === sourceId);
    if (recovered.length > 0) results.push(...recovered);
    else results.push({
      sourceId,
      targetId: "expired",
      kind: "expired",
      label: "Source unavailable",
      detail: "The cited source details are no longer retained.",
      message: "This source has expired from OmaDigest's retained evidence."
    });
  }
  return boundedSources(results);
}

export function sourceRecords(item: AttentionItem): DigestSource[] {
  const legacyResearchUrls = item.source === "omadigest.research"
    ? [...item.body.matchAll(/https:\/\/[^\s<>"']{1,2048}/gu)]
      .map((match) => (match[0] ?? "").replaceAll(/[),.;!?]+$/gu, "")).slice(0, MAX_URLS_PER_ITEM)
    : [];
  const urls = [...new Set([...(item.urls ?? []), ...legacyResearchUrls].flatMap((raw) => {
    const safe = safeDigestSourceUrl(raw);
    return safe === undefined ? [] : [safe];
  }))].slice(0, MAX_URLS_PER_ITEM);
  if (urls.length > 0) return urls.map((url, index) => {
    const parsed = new URL(url);
    const destination = parsed.hostname.replace(/^www\./u, "").slice(0, 160);
    return {
      sourceId: item.id,
      targetId: `web-${index}`,
      kind: "web" as const,
      label: item.source === "omadigest.research" ? destination : bounded(item.app, 160, destination),
      detail: bounded(item.title, 320, "Source page"),
      occurredAt: item.occurredAt,
      destination,
      url
    };
  });
  if (item.source === "notifications") return [{
    sourceId: item.id,
    targetId: "application",
    kind: "application",
    label: bounded(item.app, 160, "Application notification"),
    detail: bounded(item.title, 320, "Notification"),
    occurredAt: item.occurredAt,
    destination: bounded(item.app, 160, "Application"),
    appTarget: bounded(item.app, 120, "")
  }];
  return [{
    sourceId: item.id,
    targetId: "local",
    kind: "local",
    label: bounded(item.app, 160, "Local source"),
    detail: bounded(item.title, 320, "Local system evidence"),
    occurredAt: item.occurredAt,
    message: item.source === "omadigest.memory"
      ? "Historical context is available from Why this? and the attention timeline."
      : "This local source does not expose a page or application destination."
  }];
}

export function isDigestSource(value: unknown): value is DigestSource {
  if (!isObject(value) || typeof value.sourceId !== "string" || value.sourceId.length < 1 || value.sourceId.length > 200
    || typeof value.targetId !== "string" || !/^[a-z0-9][a-z0-9-]{0,31}$/u.test(value.targetId)
    || !["web", "application", "local", "expired"].includes(String(value.kind))
    || typeof value.label !== "string" || value.label.length > 160
    || typeof value.detail !== "string" || value.detail.length > 320) return false;
  if (value.occurredAt !== undefined && (typeof value.occurredAt !== "string" || !Number.isFinite(Date.parse(value.occurredAt)))) return false;
  if (value.destination !== undefined && (typeof value.destination !== "string" || value.destination.length > 160)) return false;
  if (value.message !== undefined && (typeof value.message !== "string" || value.message.length > 320)) return false;
  if (value.appTarget !== undefined && (typeof value.appTarget !== "string" || value.appTarget.length > 120)) return false;
  if (value.url !== undefined && (typeof value.url !== "string" || safeDigestSourceUrl(value.url) === undefined)) return false;
  return (value.kind !== "web" || typeof value.url === "string")
    && (value.kind !== "application" || (typeof value.appTarget === "string" && value.appTarget.trim() !== ""));
}

function boundedSources(candidates: DigestSource[]): DigestSource[] {
  const result: DigestSource[] = [];
  const seen = new Set<string>();
  let bytes = 2;
  for (const source of candidates.slice(0, MAX_DIGEST_SOURCES * 2)) {
    if (!isDigestSource(source)) continue;
    const key = `${source.sourceId}\u0000${source.targetId}`;
    if (seen.has(key)) continue;
    const size = Buffer.byteLength(JSON.stringify(source), "utf8") + 1;
    if (bytes + size > MAX_DIGEST_SOURCE_BYTES) continue;
    result.push(source);
    seen.add(key);
    bytes += size;
    if (result.length >= MAX_DIGEST_SOURCES) break;
  }
  return result;
}

function bounded(value: string, maximum: number, fallback: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/gu, " ").replaceAll(/\s+/gu, " ").trim().slice(0, maximum) || fallback;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
