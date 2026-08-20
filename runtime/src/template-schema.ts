import { z } from "zod";

const trigger = z.enum(["manual", "dnd-ended", "scheduled"]);

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
    maximumItems: z.number().int().min(1).max(200),
    maximumBytes: z.number().int().min(1024).max(250_000)
  }).strict(),
  output: z.object({
    sections: z.array(z.string().min(1).max(80)).min(1).max(12),
    maximumEntries: z.number().int().min(1).max(50)
  }).strict()
}).strict();
