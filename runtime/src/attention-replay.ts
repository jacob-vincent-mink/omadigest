import { z } from "zod";
import { attentionItemSchema } from "./attention.js";
import { groupAttentionItems } from "./intelligence.js";

const decisionSchema = z.object({
  at: z.string().datetime(),
  action: z.enum(["ignore", "hold", "digest", "notify", "error"]),
  sourceIds: z.array(z.string().min(1).max(200)).max(100),
  modelCall: z.boolean()
}).strict();

export const attentionReplayFixtureSchema = z.object({
  name: z.string().min(1).max(120),
  items: z.array(attentionItemSchema).max(2_000),
  decisions: z.array(decisionSchema).max(2_000)
}).strict();

export type AttentionReplayFixture = z.infer<typeof attentionReplayFixtureSchema>;
export type AttentionReplayScore = {
  name: string;
  items: number;
  groupedSubjects: number;
  correlatedItems: number;
  usefulGroupingRate: number;
  interruptions: number;
  interruptionRate: number;
  missedCritical: number;
  modelCalls: number;
  unnecessaryModelCalls: number;
};

export function scoreAttentionReplay(raw: AttentionReplayFixture): AttentionReplayScore {
  const fixture = attentionReplayFixtureSchema.parse(raw);
  const itemIds = new Set(fixture.items.map((item) => item.id));
  const groups = groupAttentionItems(fixture.items);
  const correlatedItems = groups.filter((group) => group.sourceIds.length > 1)
    .reduce((total, group) => total + group.sourceIds.length, 0);
  const interruptions = fixture.decisions.filter((decision) => decision.action === "notify").length;
  const surfaced = new Set(fixture.decisions.filter((decision) => decision.action === "notify" || decision.action === "digest")
    .flatMap((decision) => decision.sourceIds));
  const missedCritical = fixture.items.filter((item) => item.urgency === "critical" && !surfaced.has(item.id)).length;
  const modelCalls = fixture.decisions.filter((decision) => decision.modelCall).length;
  const unnecessaryModelCalls = fixture.decisions.filter((decision) => decision.modelCall
    && (decision.sourceIds.length === 0 || !decision.sourceIds.some((id) => itemIds.has(id)))).length;
  return {
    name: fixture.name,
    items: fixture.items.length,
    groupedSubjects: groups.length,
    correlatedItems,
    usefulGroupingRate: ratio(correlatedItems, fixture.items.length),
    interruptions,
    interruptionRate: ratio(interruptions, fixture.items.length),
    missedCritical,
    modelCalls,
    unnecessaryModelCalls
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round(numerator / denominator * 10_000) / 10_000;
}
