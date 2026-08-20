import { z } from "zod";

const trigger = z.enum(["manual", "dnd-ended", "scheduled"]);
const connectorId = z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/);
const categoryId = z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/);
const connectorCategories = z.record(connectorId, z.array(categoryId).max(32)).superRefine((value, context) => {
  if (Object.keys(value).length > 16) context.addIssue({ code: "custom", message: "Too many connector category entries" });
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 16 * 1024)
    context.addIssue({ code: "custom", message: "Connector categories are too large" });
});

export const compiledTemplateSchema = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/),
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
  priority: z.number().int().min(0).max(100).default(50),
  match: z.object({
    triggers: z.array(trigger).min(1).optional(),
    minimumItems: z.number().int().min(0).max(1000).optional(),
    minimumFocusMinutes: z.number().int().min(0).max(1440).optional(),
    applications: z.array(z.string().min(1).max(100)).max(32).optional(),
    minimumApplicationShare: z.number().min(0).max(1).optional(),
    requiresConnectors: z.array(z.string().min(1).max(80)).max(16).optional()
  }).strict(),
  context: z.object({
    connectors: z.array(z.string().min(1).max(80)).max(16),
    connectorCategories: connectorCategories.optional(),
    maximumItems: z.number().int().min(1).max(200),
    maximumBytes: z.number().int().min(1024).max(250_000)
  }).strict().superRefine((value, context) => {
    if (new Set(value.connectors).size !== value.connectors.length)
      context.addIssue({ code: "custom", message: "Connector IDs must be unique" });
    for (const [connector, categories] of Object.entries(value.connectorCategories ?? {})) {
      if (!value.connectors.includes(connector))
        context.addIssue({ code: "custom", message: `Category request references undeclared connector ${connector}` });
      if (new Set(categories).size !== categories.length)
        context.addIssue({ code: "custom", message: `Category IDs for ${connector} must be unique` });
    }
  }),
  output: z.object({
    sections: z.array(z.string().min(1).max(80)).min(1).max(12),
    maximumEntries: z.number().int().min(1).max(50)
  }).strict()
}).strict();
