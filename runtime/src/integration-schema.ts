import { z } from "zod";

const bytes = (maximum: number) => (value: string) => Buffer.byteLength(value, "utf8") <= maximum;
const integrationId = z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/);
export const integrationCategoryIdSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/);
const safeEntryPoint = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+\.mjs$/);
const setupField = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().min(1).max(100),
  type: z.enum(["string", "secret", "url", "boolean"]),
  description: z.string().min(1).max(500),
  required: z.boolean().default(true),
  placeholder: z.string().max(200).optional()
}).strict();

const categorySchema = z.object({
  id: integrationCategoryIdSchema,
  label: z.string().min(1).max(80).refine(bytes(160), "Category label is too large"),
  description: z.string().min(1).max(500).refine(bytes(1_000), "Category description is too large"),
  defaultEnabled: z.boolean()
}).strict();

export const integrationManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: integrationId,
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  author: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  categories: z.array(categorySchema).min(1).max(32).superRefine((categories, context) => {
    if (new Set(categories.map((category) => category.id)).size !== categories.length)
      context.addIssue({ code: "custom", message: "Category IDs must be unique" });
    if (Buffer.byteLength(JSON.stringify(categories), "utf8") > 24 * 1024)
      context.addIssue({ code: "custom", message: "Categories are too large" });
  }).optional(),
  entryPoint: safeEntryPoint,
  capabilities: z.array(z.enum(["sync", "resolve", "open"])).min(1).max(3),
  setup: z.object({
    summary: z.string().min(1).max(500),
    fields: z.array(setupField).max(16),
    actionLabel: z.string().min(1).max(80).default("Set up")
  }).strict(),
  permissions: z.object({
    networkHosts: z.array(z.string().regex(/^[a-z0-9.-]+(?::\d+)?$/)).max(32),
    networkSetupFields: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).max(8).optional(),
    commands: z.array(z.string()).max(0),
    readPaths: z.array(z.string().min(1).max(500)).max(32),
    writePaths: z.array(z.string().min(1).max(500)).max(16)
  }).strict()
}).strict().superRefine((manifest, context) => {
  for (const [index, key] of (manifest.permissions.networkSetupFields ?? []).entries()) {
    const field = manifest.setup.fields.find((candidate) => candidate.key === key);
    if (field?.type !== "url") context.addIssue({
      code: "custom",
      path: ["permissions", "networkSetupFields", index],
      message: "Dynamic network permissions must reference a declared URL setup field"
    });
  }
});

export type IntegrationManifest = z.infer<typeof integrationManifestSchema>;
