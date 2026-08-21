export const PROTOCOL_VERSION = 1;

export type GenerationTrigger = "manual" | "dnd-ended" | "scheduled";

export type AttentionItem = {
  id: string;
  source: string;
  app: string;
  title: string;
  body: string;
  category?: string | undefined;
  contentAvailable?: boolean | undefined;
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
  readAt?: string;
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
    connectorCategories?: Record<string, string[]>;
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

export type PublicTemplate = CompiledTemplate & {
  instructions: string;
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
  source: "core" | "bundled" | "user";
  enabled: boolean;
  status: SourceStatus;
  categories: PublicSourceCategory[];
  capabilities: string[];
  setup: {
    summary: string;
    fields: Array<{ key: string; label: string; type: "string" | "secret" | "url" | "boolean"; description: string; required: boolean }>;
    actionLabel: string;
  };
  permissions: { networkHosts: string[]; networkSetupFields: string[]; commands: string[]; readPaths: string[]; writePaths: string[] };
};

export type SourceStatusState = "unknown" | "checking" | "ready" | "authentication-required" | "setup-required" | "error";
export type SourceStatus = {
  state: SourceStatusState;
  message?: string;
  checkedAt?: string;
  code?: string;
  action?: { kind: "setup"; label: string };
};
export type PublicSourceCategory = {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
};

export type AgentAuthMethod = {
  id: string;
  providerId: string;
  authType: "oauth" | "api_key";
  label: string;
  description: string;
};

export type AgentAuthPrompt = {
  id: string;
  kind: "text" | "secret" | "select";
  message: string;
  placeholder?: string;
  options?: Array<{ id: string; label: string; description?: string }>;
};

export type PrivacyMode = "ignore" | "count-only" | "digest" | "digest-and-handoff";
export type PublicPrivacyPolicy = {
  defaultMode: PrivacyMode;
  rules: Array<{ app: string; mode: PrivacyMode; source: "protected-default" | "user" }>;
};

export type DataDeletionTarget = "digest-history" | "notification-history" | "integrations" | "templates" | "all";

export type BrokerCommand =
  | { type: "initialize"; protocolVersion: number }
  | { type: "select_template"; id: string; context: GenerationContext }
  | { type: "integration_set_enabled"; id: string; integrationId: string; enabled: boolean }
  | { type: "integration_set_category_enabled"; id: string; integrationId: string; categoryId: string; enabled: boolean }
  | { type: "integration_setup"; id: string; integrationId: string; values: Record<string, string | boolean> }
  | { type: "integration_status"; id: string; integrationId: string }
  | { type: "draft_start"; id: string; kind: "template" | "integration"; request: string }
  | { type: "template_revise"; id: string; templateId: string; request: string }
  | { type: "draft_accept"; id: string; draftId: string }
  | { type: "draft_reject"; id: string; draftId: string }
  | { type: "template_update"; id: string; templateId: string; instructions: string; compiledJson: string }
  | { type: "authoring_handoff"; id: string; kind: "integration"; request: string }
  | { type: "authoring_skill_install"; id: string }
  | { type: "handoff_default_agent"; id: string; prompt: string }
  | { type: "handoff_herdr"; id: string; kind: "template" | "integration"; request: string; draftJson: string }
  | { type: "digest_handoff"; id: string; digestId: string; sectionIndex: number; entryIndex: number }
  | { type: "agent_status"; id: string }
  | { type: "privacy_status"; id: string }
  | { type: "privacy_set_default"; id: string; mode: PrivacyMode }
  | { type: "privacy_set_rule"; id: string; app: string; mode: PrivacyMode }
  | { type: "auth_begin"; id: string; methodId: string }
  | { type: "auth_response"; id: string; flowId: string; promptId: string; value: string }
  | { type: "auth_cancel"; id: string; flowId: string }
  | { type: "auth_open_url"; id: string; url: string }
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
  | { type: "attention_acknowledge"; id: string; itemIds: string[] }
  | { type: "digest_generate"; id: string; templateId?: string; context: GenerationContext }
  | { type: "digest_history"; id: string }
  | { type: "digest_mark_read"; id: string; digestId: string }
  | { type: "digest_delete"; id: string; digestId: string }
  | { type: "digest_clear"; id: string }
  | { type: "data_delete"; id: string; target: DataDeletionTarget }
  | { type: "shutdown" };

export type BrokerEvent =
  | { type: "ready"; protocolVersion: number; templates: PublicTemplate[]; integrations: PublicIntegration[]; authMethods: AgentAuthMethod[]; privacy: PublicPrivacyPolicy }
  | { type: "templates"; id: string; templates: PublicTemplate[] }
  | { type: "template_selected"; id: string; selection: TemplateSelection }
  | { type: "integrations"; id: string; integrations: PublicIntegration[] }
  | { type: "integration_setup"; id: string; integrationId: string; ready: boolean; message: string; status: SourceStatus }
  | { type: "integration_status"; id: string; integrationId: string; ready: boolean; message: string; status: SourceStatus }
  | { type: "draft_state"; id: string; state: "working" }
  | { type: "draft_progress"; id: string; phase: string; message: string }
  | { type: "draft_plan"; id: string; steps: string[]; currentStep: number; status: "working" | "complete" }
  | { type: "draft"; id: string; draft: unknown }
  | { type: "draft_saved"; id: string; draftId: string; kind: "template" | "integration" }
  | { type: "template_saved"; id: string; templateId: string }
  | { type: "handoff"; id: string; state: "launched"; target?: "default-agent" | "herdr" | "authoring-agent" }
  | { type: "authoring_skill"; id: string; state: "installed"; locations: number }
  | { type: "agent_status"; id: string; connected: boolean; provider: string; model: string }
  | { type: "privacy"; id: string; policy: PublicPrivacyPolicy }
  | { type: "auth_methods"; id?: string; methods: AgentAuthMethod[] }
  | { type: "auth"; id?: string; phase: "starting" | "browser" | "device_code" | "prompt" | "info" | "complete" | "cancelled" | "error"; flowId: string; methodId: string; message?: string; url?: string; verificationUri?: string; userCode?: string; prompt?: AgentAuthPrompt }
  | { type: "dictation"; id: string; available: boolean; state: "idle" | "recording" | "transcribing"; transcript?: string }
  | { type: "tts"; id: string; configured: boolean; state: "idle" | "playing" | "paused"; config?: { provider: string; endpoint: string; model: string; voice: string; speed: number } }
  | { type: "attention"; id: string; count: number; acknowledgedIds: string[] }
  | { type: "digest_state"; id: string; state: "working"; templateId: string }
  | { type: "digest"; id: string; digest: Digest }
  | { type: "digest_history"; id: string; digests: Digest[] }
  | { type: "data_deleted"; id: string; target: DataDeletionTarget }
  | { type: "error"; id?: string; code: string; message: string };
