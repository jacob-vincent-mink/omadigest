import { z } from "zod";

const integrationId = z.string().regex(/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/);
const safeEntryPoint = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+\.mjs$/);
const setupField = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  label: z.string().min(1).max(100),
  type: z.enum(["string", "secret", "url", "boolean"]),
  description: z.string().min(1).max(500),
  required: z.boolean().default(true),
  placeholder: z.string().max(200).optional()
}).strict();

export const integrationManifestSchema = z.object({
  schemaVersion: z.literal(1),
  id: integrationId,
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/),
  author: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  entryPoint: safeEntryPoint,
  capabilities: z.array(z.enum(["sync", "resolve", "open"])).min(1).max(3),
  setup: z.object({
    summary: z.string().min(1).max(500),
    fields: z.array(setupField).max(16),
    actionLabel: z.string().min(1).max(80).default("Set up")
  }).strict(),
  permissions: z.object({
    networkHosts: z.array(z.string().regex(/^[a-z0-9.-]+(?::\d+)?$/)).max(32),
    commands: z.array(z.string().regex(/^[a-zA-Z0-9._+-]+$/)).max(16),
    readPaths: z.array(z.string().min(1).max(500)).max(32),
    writePaths: z.array(z.string().min(1).max(500)).max(16)
  }).strict()
}).strict();

export type IntegrationManifest = z.infer<typeof integrationManifestSchema>;
