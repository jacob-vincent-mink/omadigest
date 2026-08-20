export function isSpecificDigestTitle(title: string, templateName: string): boolean {
  const normalized = normalize(title);
  if (normalized === "") return false;
  if (/^(today s |daily |current |latest )?(digest|briefing|report|summary)( for today)?$/u.test(normalized)) return false;

  const template = normalize(templateName);
  if (normalized === template) return false;
  if (normalized === `${template} digest` || normalized === `${template} briefing` || normalized === `${template} report`) return false;
  return true;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replaceAll(/[^a-z0-9]+/gu, " ").trim();
}
