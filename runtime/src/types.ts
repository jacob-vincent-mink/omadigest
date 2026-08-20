export const PROTOCOL_VERSION = 1;

export type GenerationTrigger = "manual" | "dnd-ended" | "scheduled";

export type AttentionItem = {
  id: string;
  source: string;
  app: string;
  title: string;
  body: string;
  urgency: "low" | "normal" | "critical";
  occurredAt: string;
};

export type DigestEntry = {
  headline: string;
  explanation: string;
  importance: "high" | "normal" | "low";
  sourceIds: string[];
  confidence: number;
};

export type Digest = {
  id: string;
  templateId: string;
  title: string;
  generatedAt: string;
  sections: Array<{ title: string; entries: DigestEntry[] }>;
};

export type GenerationContext = {
  trigger: GenerationTrigger;
  itemCount: number;
  focusMinutes: number;
  appCounts: Record<string, number>;
  availableConnectors: string[];
  now: string;
};

export type TemplateMatch = {
  triggers?: GenerationTrigger[];
  minimumItems?: number;
  minimumFocusMinutes?: number;
  applications?: string[];
  minimumApplicationShare?: number;
  requiresConnectors?: string[];
};

export type CompiledTemplate = {
  version: 1;
  id: string;
  name: string;
  description: string;
  priority: number;
  match: TemplateMatch;
  context: {
    connectors: string[];
    maximumItems: number;
    maximumBytes: number;
  };
  output: {
    sections: string[];
    maximumEntries: number;
  };
};

export type DigestTemplate = {
  manifest: CompiledTemplate;
  instructions: string;
  directory: string;
};

export type TemplateSelection = {
  templateId: string;
  name: string;
  score: number;
  reasons: string[];
};

export type PublicIntegration = {
  id: string;
  name: string;
  version: string;
  description: string;
  source: "bundled" | "user";
  enabled: boolean;
  capabilities: string[];
  setup: {
    summary: string;
    fields: Array<{ key: string; label: string; type: "string" | "secret" | "url" | "boolean"; description: string; required: boolean }>;
    actionLabel: string;
  };
  permissions: { networkHosts: string[]; commands: string[]; readPaths: string[]; writePaths: string[] };
};

export type BrokerCommand =
  | { type: "initialize"; protocolVersion: number }
  | { type: "select_template"; id: string; context: GenerationContext }
  | { type: "integration_set_enabled"; id: string; integrationId: string; enabled: boolean }
  | { type: "integration_setup"; id: string; integrationId: string; values: Record<string, string | boolean> }
  | { type: "draft_start"; id: string; kind: "template" | "integration"; request: string }
  | { type: "draft_accept"; id: string; draftId: string }
  | { type: "draft_reject"; id: string; draftId: string }
  | { type: "handoff_default_agent"; id: string; prompt: string }
  | { type: "agent_status"; id: string }
  | { type: "dictation_status"; id: string }
  | { type: "dictation_start"; id: string }
  | { type: "dictation_stop"; id: string }
  | { type: "dictation_cancel"; id: string }
  | { type: "tts_status"; id: string }
  | { type: "tts_configure"; id: string; config: { provider: "openai-compatible" | "elevenlabs"; endpoint: string; model: string; voice: string; speed: number }; apiKey: string }
  | { type: "tts_speak"; id: string; text: string }
  | { type: "tts_pause"; id: string }
  | { type: "tts_stop"; id: string }
  | { type: "attention_ingest"; id: string; items: AttentionItem[] }
  | { type: "digest_generate"; id: string; templateId?: string; context: GenerationContext }
  | { type: "digest_history"; id: string }
  | { type: "digest_delete"; id: string; digestId: string }
  | { type: "digest_clear"; id: string }
  | { type: "shutdown" };

export type BrokerEvent =
  | { type: "ready"; protocolVersion: number; templates: Array<{ id: string; name: string; description: string }>; integrations: PublicIntegration[] }
  | { type: "template_selected"; id: string; selection: TemplateSelection }
  | { type: "integrations"; id: string; integrations: PublicIntegration[] }
  | { type: "integration_setup"; id: string; integrationId: string; ready: boolean; message: string }
  | { type: "draft_state"; id: string; state: "working" }
  | { type: "draft"; id: string; draft: unknown }
  | { type: "draft_saved"; id: string; draftId: string; kind: "template" | "integration" }
  | { type: "handoff"; id: string; state: "launched" }
  | { type: "agent_status"; id: string; connected: boolean; provider: string; model: string }
  | { type: "dictation"; id: string; available: boolean; state: "idle" | "recording" | "transcribing"; transcript?: string }
  | { type: "tts"; id: string; configured: boolean; state: "idle" | "playing" | "paused"; config?: { provider: string; endpoint: string; model: string; voice: string; speed: number } }
  | { type: "attention"; id: string; count: number }
  | { type: "digest_state"; id: string; state: "working"; templateId: string }
  | { type: "digest"; id: string; digest: Digest }
  | { type: "digest_history"; id: string; digests: Digest[] }
  | { type: "error"; id?: string; code: string; message: string };
