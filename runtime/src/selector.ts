import type { DigestTemplate, GenerationContext, TemplateSelection } from "./types.js";

export function selectTemplate(templates: DigestTemplate[], context: GenerationContext): TemplateSelection {
  const matches = templates.flatMap((template) => {
    const reasons = matchReasons(template, context);
    if (reasons === undefined) return [];
    const specificity = Object.values(template.manifest.match).filter((value) => value !== undefined).length;
    return [{
      templateId: template.manifest.id,
      name: template.manifest.name,
      score: template.manifest.priority * 100 + specificity,
      reasons
    } satisfies TemplateSelection];
  });
  matches.sort((left, right) => right.score - left.score || left.templateId.localeCompare(right.templateId));
  const selected = matches[0];
  if (selected === undefined) throw new Error("No digest template matches this generation context");
  return selected;
}

function matchReasons(template: DigestTemplate, context: GenerationContext): string[] | undefined {
  const match = template.manifest.match;
  const reasons: string[] = [];
  if (match.triggers !== undefined) {
    if (!match.triggers.includes(context.trigger)) return undefined;
    reasons.push(`trigger is ${context.trigger}`);
  }
  if (match.minimumItems !== undefined) {
    if (context.itemCount < match.minimumItems) return undefined;
    reasons.push(`${context.itemCount} items meet the ${match.minimumItems}-item threshold`);
  }
  if (match.minimumFocusMinutes !== undefined) {
    if (context.focusMinutes < match.minimumFocusMinutes) return undefined;
    reasons.push(`focus lasted ${context.focusMinutes} minutes`);
  }
  if (match.applications !== undefined) {
    const applications = new Set(match.applications.map(normalize));
    const matchingCount = Object.entries(context.appCounts)
      .filter(([application]) => applications.has(normalize(application)))
      .reduce((total, [, count]) => total + Math.max(0, count), 0);
    if (matchingCount === 0) return undefined;
    const share = context.itemCount === 0 ? 0 : matchingCount / context.itemCount;
    if (share < (match.minimumApplicationShare ?? 0)) return undefined;
    reasons.push(`${matchingCount} items came from ${match.applications.join(", ")}`);
  }
  if (match.requiresConnectors !== undefined) {
    const available = new Set(context.availableConnectors.map(normalize));
    if (!match.requiresConnectors.every((connector) => available.has(normalize(connector)))) return undefined;
    reasons.push(`required connectors are available`);
  }
  if (reasons.length === 0) reasons.push("default fallback");
  return reasons;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
