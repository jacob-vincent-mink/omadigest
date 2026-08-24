export const PROTOCOL_VERSION = 2;

export type GenerationTrigger = "manual" | "dnd-ended" | "scheduled";
export type AttentionWakeReason = GenerationTrigger | "notification-batch" | "source-event" | "follow-up" | "startup";
export type AttentionIntent = "failure" | "review" | "deadline" | "meeting" | "assignment"
  | "mention" | "request" | "completion" | "system" | "update";

export type AttentionItem = {
  id: string;
  source: string;
  app: string;
  title: string;
  body: string;
  category?: string | undefined;
  intent?: AttentionIntent | undefined;
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
  feedback?: "useful" | "not-useful";
  sections: Array<{ title: string; entries: DigestEntry[] }>;
};

export type GenerationContext = {
  trigger: GenerationTrigger;
  itemCount: number;
  focusMinutes: number;
  automaticMinimumItems?: number | undefined;
  appCounts: Record<string, number>;
  intentCounts?: Partial<Record<AttentionIntent, number>> | undefined;
  urgencyCounts?: Record<"low" | "normal" | "critical", number> | undefined;
  availableConnectors: string[];
  now: string;
};

export type TemplateMatch = {
  triggers?: GenerationTrigger[];
  minimumItems?: number;
  minimumFocusMinutes?: number;
  applications?: string[];
  minimumApplicationShare?: number;
  intents?: AttentionIntent[];
  minimumIntentShare?: number;
  urgencies?: Array<"low" | "normal" | "critical">;
  requiresConnectors?: string[];
};

export type EvidenceGroup = {
  id: string;
  intent: AttentionIntent;
  subject: string;
  reason: "shared-reference" | "shared-entity" | "same-title" | "single";
  sourceIds: string[];
  items: AttentionItem[];
};

export type TemplateSuggestion = {
  id: string;
  title: string;
  description: string;
  prompt: string;
  applications: string[];
  intents: AttentionIntent[];
  itemCount: number;
  example?: string;
};

export type AttentionPolicyAction = "ignore" | "hold" | "digest" | "notify";
export type AttentionPolicy = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  action: AttentionPolicyAction;
  match: {
    applications?: string[];
    sources?: string[];
    intents?: AttentionIntent[];
    urgencies?: Array<"low" | "normal" | "critical">;
    entities?: string[];
    contains?: string[];
  };
  templateId?: string;
  followUpMinutes?: number;
  createdAt: string;
};

export type AttentionPolicyPreview = {
  id: string;
  draft: Omit<AttentionPolicy, "id" | "enabled" | "createdAt">;
  matchedCount: number;
  examples: Array<{ id: string; app: string; title: string }>;
  conflicts: Array<{
    policyId: string;
    name: string;
    action: AttentionPolicyAction;
    priority: number;
    winner: "draft" | "existing";
  }>;
  expiresAt: string;
};

export type AttentionPreferenceHint = {
  subject: string;
  signal: "surface" | "defer";
  reason: string;
  sampleSize: number;
};

export type JitAttentionContext = {
  sourceId: string;
  subject: string;
  dueAt: string;
  minutesUntil: number;
};

export type AttentionExplanation = {
  title: string;
  summary: string;
  sourceCount: number;
  applications: string[];
  entities: string[];
  thread?: { id: string; label: string };
  policy?: { id: string; name: string; action: AttentionPolicyAction };
  history: AttentionMemoryNode[];
};

export type AttentionProposal =
  | { action: "hold"; reason: string; sourceIds: string[]; subject: string; wakeOn: AttentionWatchCondition[]; followUpMinutes: number }
  | { action: "digest"; reason: string; sourceIds: string[]; templateId: string }
  | { action: "notify"; reason: string; sourceIds: string[]; headline: string; body: string; urgency: "normal" | "critical" };

export type AttentionWatchCondition = "new-evidence" | "source-change" | "deadline";

export type AttentionWatch = {
  id: string;
  reason: string;
  subject: string;
  sourceIds: string[];
  wakeOn: AttentionWatchCondition[];
  createdAt: string;
  dueAt: string;
  expiresAt: string;
  attempts: number;
  hiddenAt?: string | undefined;
};

export type AttentionMemoryKind = "evidence" | "decision" | "digest" | "outcome";

export type AttentionMemoryNode = {
  id: string;
  kind: "episode" | "summary";
  episodeKinds: AttentionMemoryKind[];
  subject: string;
  summary: string;
  from: string;
  to: string;
  episodeCount: number;
  sourceIds: string[];
};

export type AttentionMemoryStatus = {
  episodeCount: number;
  summaryCount: number;
  oldestAt?: string;
  newestAt?: string;
};

export type AttentionTimelineMode = "events" | "memory";

export type AttentionThread = {
  id: string;
  label: string;
  episodeCount: number;
  sourceCount: number;
  applications: string[];
  lastAt: string;
  lastAction?: AttentionPolicyAction | "read" | "handoff" | "cancelled" | "useful" | "not-useful";
};

export type AttentionTimelineItem = {
  id: string;
  kind: AttentionMemoryKind | "summary";
  subject: string;
  summary: string;
  from: string;
  to: string;
  episodeCount: number;
  sourceCount: number;
  applications: string[];
  threadId?: string;
  threadLabel?: string;
  action?: AttentionPolicyAction | "read" | "handoff" | "cancelled" | "useful" | "not-useful";
  digestId?: string;
  memoryNodeId?: string;
  expandable: boolean;
};

export type AttentionTimelinePage = {
  mode: AttentionTimelineMode;
  items: AttentionTimelineItem[];
  threads: AttentionThread[];
  hasMore: boolean;
  nextCursor?: string;
  selectedThreadId?: string;
};

export type AttentionCalibration = {
  outcomeCount: number;
  readCount: number;
  handoffCount: number;
  usefulCount: number;
  notUsefulCount: number;
  subjects: Array<{
    threadId: string;
    label: string;
    signal: "surface" | "defer" | "neutral";
    sampleSize: number;
    lastAt: string;
  }>;
};

export type AttentionActivity = {
  state: "idle" | "observing" | "checking" | "deliberating" | "holding" | "generating" | "notifying" | "error";
  message: string;
  heldCount: number;
  nextCheckAt?: string;
  dailyDeliberations: number;
  dailyLimit: number;
};

export type ResearchCadence = "hourly" | "six-hourly" | "daily" | "weekly";
export type ResearchDepth = "focused" | "broad" | "deep";
export type ResearchRecency = "day" | "week" | "month" | "anytime";

export type ResearchWatch = {
  id: string;
  name: string;
  question: string;
  cadence: ResearchCadence;
  depth: ResearchDepth;
  recency: ResearchRecency;
  sourceUrls: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  nextRunAt: string;
  lastRunAt?: string;
};

export type ResearchEvidence = {
  url: string;
  title: string;
  retrievedAt: string;
  publishedAt?: string;
  updatedAt?: string;
  excerptHash: string;
};

export type ResearchClaim = {
  key: string;
  statement: string;
  significance: string;
  confidence: number;
  evidence: ResearchEvidence[];
};

export type ResearchChange = {
  kind: "new" | "changed" | "no-longer-supported";
  key: string;
  statement: string;
  previousStatement?: string;
  significance: string;
  confidence: number;
  evidence: ResearchEvidence[];
};

export type ResearchRetirement = {
  key: string;
  reason: string;
  evidence: ResearchEvidence[];
};

export type ResearchRun = {
  id: string;
  watchId: string;
  watchName: string;
  startedAt: string;
  completedAt: string;
  status: "complete" | "partial" | "error";
  summary: string;
  baseline: boolean;
  meaningfulChange: boolean;
  claims: ResearchClaim[];
  changes: ResearchChange[];
  depth?: ResearchDepth;
  searchCount?: number;
  readCount?: number;
  sourceCount?: number;
  corpusChars?: number;
  error?: string;
};

export type ResearchActivity = {
  state: "idle" | "searching" | "reading" | "synthesizing" | "error";
  message: string;
  watchId?: string;
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

export type DataDeletionTarget = "digest-history" | "notification-history" | "research" | "integrations" | "templates" | "all";

export type ReleaseUpdateStatus = {
  state: "unknown" | "checking" | "current" | "available";
  currentVersion: string;
  latestVersion?: string;
  releaseUrl?: string;
  checkedAt?: string;
  dismissed: boolean;
  message?: string;
};

export type BrokerCommand =
  | { type: "initialize"; protocolVersion: number }
  | { type: "update_check"; id: string }
  | { type: "update_dismiss"; id: string }
  | { type: "update_open"; id: string }
  | { type: "research_create"; id: string; name: string; question: string; cadence: ResearchCadence; depth: ResearchDepth; recency: ResearchRecency; sourceUrls: string[] }
  | { type: "research_update"; id: string; watchId: string; depth: ResearchDepth; recency: ResearchRecency }
  | { type: "research_set_enabled"; id: string; watchId: string; enabled: boolean }
  | { type: "research_run"; id: string; watchId: string }
  | { type: "research_rebaseline"; id: string; watchId: string }
  | { type: "research_delete"; id: string; watchId: string }
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
  | { type: "handoff_prepare"; id: string; request: string }
  | { type: "handoff_default_agent"; id: string; token: string }
  | { type: "handoff_herdr"; id: string; kind: "template" | "integration"; request: string; draftJson: string }
  | { type: "digest_handoff"; id: string; digestId: string; sectionIndex: number; entryIndex: number }
  | { type: "agent_status"; id: string }
  | { type: "privacy_status"; id: string }
  | { type: "privacy_set_default"; id: string; mode: PrivacyMode }
  | { type: "privacy_set_rule"; id: string; app: string; mode: PrivacyMode }
  | { type: "privacy_delete_rule"; id: string; app: string }
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
  | { type: "attention_refresh_notifications"; id: string }
  | { type: "attention_acknowledge"; id: string; itemIds: string[] }
  | { type: "attention_acknowledge_all"; id: string }
  | { type: "attention_focus"; id: string; active: boolean }
  | { type: "attention_watch_dismiss"; id: string; watchId: string }
  | { type: "attention_watch_show"; id: string; watchId: string }
  | { type: "attention_watch_cancel"; id: string; watchId: string }
  | { type: "attention_memory_search"; id: string; query: string }
  | { type: "attention_timeline_query"; id: string; mode: AttentionTimelineMode; threadId?: string; cursor?: string; limit?: number }
  | { type: "attention_timeline_zoom"; id: string; nodeId: string }
  | { type: "attention_explain"; id: string; digestId: string; sectionIndex: number; entryIndex: number }
  | { type: "attention_policy_create"; id: string; request: string }
  | { type: "attention_policy_accept"; id: string; previewId: string }
  | { type: "attention_policy_reject"; id: string; previewId: string }
  | { type: "attention_policy_set_enabled"; id: string; policyId: string; enabled: boolean }
  | { type: "attention_policy_delete"; id: string; policyId: string }
  | { type: "attention_wake"; id: string; reason: GenerationTrigger; focusMinutes: number; minimumItems: number }
  | { type: "template_suggestion_dismiss"; id: string; suggestionId: string }
  | { type: "digest_generate"; id: string; templateId?: string; context: GenerationContext }
  | { type: "digest_history"; id: string }
  | { type: "digest_mark_read"; id: string; digestId: string }
  | { type: "digest_feedback"; id: string; digestId: string; feedback: "useful" | "not-useful" }
  | { type: "digest_delete"; id: string; digestId: string }
  | { type: "digest_clear"; id: string }
  | { type: "template_delete"; id: string; templateId: string }
  | { type: "data_delete"; id: string; target: DataDeletionTarget }
  | { type: "shutdown" };

export type BrokerEvent =
  | { type: "ready"; protocolVersion: number; templates: PublicTemplate[]; integrations: PublicIntegration[]; authMethods: AgentAuthMethod[]; privacy: PublicPrivacyPolicy; policies: AttentionPolicy[]; templateSuggestions: TemplateSuggestion[]; update: ReleaseUpdateStatus; researchWatches: ResearchWatch[]; researchRuns: ResearchRun[] }
  | { type: "research_state"; id: string; watches: ResearchWatch[]; runs: ResearchRun[]; activity: ResearchActivity }
  | { type: "update_status"; id: string; status: ReleaseUpdateStatus }
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
  | { type: "handoff_preview"; id: string; token: string; prompt: string }
  | { type: "handoff"; id: string; state: "launched"; target?: "default-agent" | "herdr" | "authoring-agent" }
  | { type: "authoring_skill"; id: string; state: "installed"; locations: number }
  | { type: "agent_status"; id: string; connected: boolean; provider: string; model: string }
  | { type: "privacy"; id: string; policy: PublicPrivacyPolicy }
  | { type: "auth_methods"; id?: string; methods: AgentAuthMethod[] }
  | { type: "auth"; id?: string; phase: "starting" | "browser" | "device_code" | "prompt" | "info" | "complete" | "cancelled" | "error"; flowId: string; methodId: string; message?: string; url?: string; verificationUri?: string; userCode?: string; prompt?: AgentAuthPrompt }
  | { type: "dictation"; id: string; available: boolean; state: "idle" | "recording" | "transcribing"; transcript?: string }
  | { type: "tts"; id: string; configured: boolean; state: "idle" | "playing" | "paused"; config?: { provider: string; endpoint: string; model: string; voice: string; speed: number } }
  | { type: "attention"; id: string; digestibleCount: number; acknowledgedIds: string[] }
  | { type: "attention_activity"; id: string; activity: AttentionActivity }
  | { type: "attention_state"; id: string; watches: AttentionWatch[]; memory: AttentionMemoryStatus; calibration: AttentionCalibration }
  | { type: "attention_memory_results"; id: string; query: string; results: AttentionMemoryNode[] }
  | { type: "attention_timeline"; id: string; page: AttentionTimelinePage; append: boolean }
  | { type: "attention_timeline_zoomed"; id: string; parentId: string; items: AttentionTimelineItem[] }
  | { type: "attention_explanation"; id: string; explanation: AttentionExplanation }
  | { type: "attention_policies"; id: string; policies: AttentionPolicy[] }
  | { type: "attention_policy_preview"; id: string; preview: AttentionPolicyPreview }
  | { type: "attention_policy_state"; id: string; state: "working" | "preview" | "saved" | "idle"; message: string }
  | { type: "template_suggestions"; id: string; suggestions: TemplateSuggestion[] }
  | { type: "digest_state"; id: string; state: "working"; templateId: string }
  | { type: "digest_skipped"; id: string; reason: string }
  | { type: "digest"; id: string; digest: Digest }
  | { type: "digest_history"; id: string; digests: Digest[] }
  | { type: "data_deleted"; id: string; target: DataDeletionTarget }
  | { type: "error"; id?: string; code: string; message: string };
