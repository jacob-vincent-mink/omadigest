export function isSpecificDigestTitle(title: string, templateName: string): boolean {
  const normalized = normalize(title);
  if (normalized === "") return false;
  if (/^(today s |daily |current |latest )?(digest|briefing|report|summary)( for today)?$/u.test(normalized)) return false;

  const template = normalize(templateName);
  if (normalized === template) return false;
  if (normalized === `${template} digest` || normalized === `${template} briefing` || normalized === `${template} report`) return false;
  return true;
}

export function validateDigestEvidence(entries: DigestEntry[], groups: EvidenceGroup[]): string | undefined {
  const allowedSources = new Set(groups.flatMap((group) => group.sourceIds));
  const usedSources = new Set<string>();
  for (const entry of entries) for (const sourceId of entry.sourceIds) {
    if (!allowedSources.has(sourceId)) return "Every citation must reference a supplied source ID.";
    if (usedSources.has(sourceId)) return "A source item may support only one digest entry; merge overlapping entries.";
    usedSources.add(sourceId);
  }
  if (entries.some((entry) => exposesCompilationProcess(`${entry.headline}\n${entry.explanation}`)))
    return "State the useful conclusion directly without mentioning evidence groups, source IDs, or the compilation process.";
  for (const group of groups) {
    if (group.sourceIds.length < 2) continue;
    const owners = entries.flatMap((entry, index) => entry.sourceIds.some((id) => group.sourceIds.includes(id)) ? [index] : []);
    if (new Set(owners).size > 1)
      return "Updates in one broker evidence group must be summarized together, not split across entries.";
    const owner = owners[0] === undefined ? undefined : entries[owners[0]];
    if (owner !== undefined && group.sourceIds.some((id) => !owner.sourceIds.includes(id)))
      return "A correlated evidence group must be cited as one complete block, not sampled message by message.";
  }
  return undefined;
}

function exposesCompilationProcess(value: string): boolean {
  return /\b(?:evidence groups?|source ids?|broker classifications?|combined outcome|updates? (?:were|was|are|is|have been) (?:combined|merged|grouped|collated))\b/iu.test(value);
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/gu, " ").trim();
}
import type { DigestEntry, EvidenceGroup } from "./types.js";
