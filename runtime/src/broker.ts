import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { z } from "zod";
import { loadTemplates } from "./templates.js";
import { selectTemplate } from "./selector.js";
import { discoverIntegrations, integrationConfigRoot, setIntegrationEnabled } from "./integrations.js";
import { IntegrationRuntime } from "./integration-runtime.js";
import { agentConnectionStatus, runDigestAgent, runDraftAgent, type DraftResult } from "./agent.js";
import { AttentionStore, attentionItemSchema } from "./attention.js";
import { installDraft } from "./drafts.js";
import { DictationService } from "./dictation.js";
import { SpeechService, speechConfigSchema } from "./tts.js";
import { DigestHistory } from "./digest-history.js";
import { PROTOCOL_VERSION, type BrokerEvent, type PublicIntegration } from "./types.js";

const contextSchema = z.object({
  trigger: z.enum(["manual", "dnd-ended", "scheduled"]),
  itemCount: z.number().int().min(0).max(10_000),
  focusMinutes: z.number().min(0).max(10_000),
  appCounts: z.record(z.string(), z.number().int().min(0).max(10_000)),
  availableConnectors: z.array(z.string().min(1).max(80)).max(64),
  now: z.string().datetime()
}).strict();

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("initialize"), protocolVersion: z.number().int() }).strict(),
  z.object({ type: z.literal("select_template"), id: z.string().min(1).max(100), context: contextSchema }).strict(),
  z.object({
    type: z.literal("integration_set_enabled"),
    id: z.string().min(1).max(100),
    integrationId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
    enabled: z.boolean()
  }).strict(),
  z.object({
    type: z.literal("integration_setup"),
    id: z.string().min(1).max(100),
    integrationId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/),
    values: z.record(z.string(), z.union([z.string().max(20_000), z.boolean()]))
  }).strict(),
  z.object({
    type: z.literal("draft_start"),
    id: z.string().min(1).max(100),
    kind: z.enum(["template", "integration"]),
    request: z.string().min(1).max(20_000)
  }).strict(),
  z.object({ type: z.literal("draft_accept"), id: z.string().min(1).max(100), draftId: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("draft_reject"), id: z.string().min(1).max(100), draftId: z.string().min(1).max(100) }).strict(),
  z.object({
    type: z.literal("handoff_default_agent"),
    id: z.string().min(1).max(100),
    prompt: z.string().min(1).max(10_000)
  }).strict(),
  z.object({ type: z.literal("agent_status"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("dictation_status"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("dictation_start"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("dictation_stop"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("dictation_cancel"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("tts_status"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("tts_configure"), id: z.string().min(1).max(100), config: speechConfigSchema, apiKey: z.string().min(1).max(20_000) }).strict(),
  z.object({ type: z.literal("tts_speak"), id: z.string().min(1).max(100), text: z.string().min(1).max(20_000) }).strict(),
  z.object({ type: z.literal("tts_pause"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("tts_stop"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("attention_ingest"), id: z.string().min(1).max(100), items: z.array(attentionItemSchema).max(200) }).strict(),
  z.object({
    type: z.literal("digest_generate"),
    id: z.string().min(1).max(100),
    templateId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).optional(),
    context: contextSchema
  }).strict(),
  z.object({ type: z.literal("digest_history"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("digest_delete"), id: z.string().min(1).max(100), digestId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("digest_clear"), id: z.string().min(1).max(100) }).strict(),
  z.object({ type: z.literal("shutdown") }).strict()
]);

const pluginRoot = process.env.OMADIGEST_PLUGIN_DIR?.startsWith("/")
  ? process.env.OMADIGEST_PLUGIN_DIR
  : resolve(fileURLToPath(new URL("../..", import.meta.url)));
const configRoot = integrationConfigRoot();
function loadAllTemplates() {
  const byId = new Map(loadTemplates(resolve(pluginRoot, "templates")).map((template) => [template.manifest.id, template]));
  for (const template of loadTemplates(resolve(configRoot, "templates"))) byId.set(template.manifest.id, template);
  return [...byId.values()].sort((left, right) => left.manifest.id.localeCompare(right.manifest.id));
}
let templates = loadAllTemplates();
const pendingDrafts = new Map<string, DraftResult>();
const attention = new AttentionStore();
const digestHistory = new DigestHistory();
const integrationRuntime = new IntegrationRuntime(configRoot);
const dictation = new DictationService();
const speech = new SpeechService(configRoot);
const integrationRoots = {
  bundled: resolve(pluginRoot, "integrations"),
  user: resolve(configRoot, "integrations"),
  state: resolve(configRoot, "integration-state.json")
};

function publicIntegrations(): PublicIntegration[] {
  return discoverIntegrations(integrationRoots.bundled, integrationRoots.user, integrationRoots.state)
    .map(({ manifest, source, enabled }) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      source,
      enabled,
      capabilities: manifest.capabilities,
      setup: manifest.setup,
      permissions: manifest.permissions
    }));
}

function emit(event: BrokerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

async function handle(raw: string): Promise<boolean> {
  let command: z.infer<typeof commandSchema>;
  try {
    command = commandSchema.parse(JSON.parse(raw));
  } catch {
    emit({ type: "error", code: "invalid_command", message: "The broker received an invalid command." });
    return true;
  }

  if (command.type === "shutdown") return false;
  if (command.type === "initialize") {
    if (command.protocolVersion !== PROTOCOL_VERSION) {
      emit({ type: "error", code: "protocol_mismatch", message: `OmaDigest requires protocol ${PROTOCOL_VERSION}.` });
      return true;
    }
    emit({
      type: "ready",
      protocolVersion: PROTOCOL_VERSION,
      templates: templates.map(({ manifest, instructions }) => ({ ...manifest, instructions })),
      integrations: publicIntegrations()
    });
    return true;
  }

  if (command.type === "agent_status") {
    const status = await agentConnectionStatus();
    emit({ type: "agent_status", id: command.id, ...status });
    return true;
  }

  if (command.type === "dictation_status" || command.type === "dictation_start"
    || command.type === "dictation_stop" || command.type === "dictation_cancel") {
    try {
      if (command.type === "dictation_start") {
        await dictation.start();
        emit({ type: "dictation", id: command.id, available: true, state: "recording" });
      } else if (command.type === "dictation_stop") {
        emit({ type: "dictation", id: command.id, available: true, state: "transcribing" });
        const transcript = await dictation.stop();
        emit({ type: "dictation", id: command.id, available: true, state: "idle", transcript });
      } else if (command.type === "dictation_cancel") {
        await dictation.cancel();
        const status = await dictation.status();
        emit({ type: "dictation", id: command.id, available: status.available, state: "idle" });
      } else {
        const status = await dictation.status();
        emit({ type: "dictation", id: command.id, available: status.available, state: status.recording ? "recording" : "idle" });
      }
    } catch (error) {
      emit({ type: "error", id: command.id, code: "dictation_failed", message: error instanceof Error ? error.message : "Dictation failed." });
    }
    return true;
  }

  if (command.type === "attention_ingest") {
    try {
      const count = attention.ingest(command.items);
      emit({ type: "attention", id: command.id, count });
    } catch {
      emit({ type: "error", id: command.id, code: "attention_invalid", message: "Some attention items were invalid." });
    }
    return true;
  }

  if (command.type === "digest_history" || command.type === "digest_delete" || command.type === "digest_clear") {
    if (command.type === "digest_delete") digestHistory.delete(command.digestId);
    else if (command.type === "digest_clear") digestHistory.clear();
    emit({ type: "digest_history", id: command.id, digests: digestHistory.list() });
    return true;
  }

  if (command.type === "digest_generate") {
    try {
      const selectedId = command.templateId || selectTemplate(templates, command.context).templateId;
      const template = templates.find((candidate) => candidate.manifest.id === selectedId);
      if (template === undefined) throw new Error("The selected digest template is unavailable");
      const now = new Date(command.context.now);
      const connectorItems = await integrationRuntime.sync(
        discoverIntegrations(integrationRoots.bundled, integrationRoots.user, integrationRoots.state),
        new Date(now.getTime() - 86_400_000).toISOString(),
        new Date(now.getTime() + 7 * 86_400_000).toISOString()
      );
      attention.ingest(connectorItems);
      const items = attention.recent(template.manifest.context.maximumItems);
      emit({ type: "digest_state", id: command.id, state: "working", templateId: selectedId });
      const digest = await runDigestAgent(template, items, pluginRoot);
      digestHistory.save(digest);
      emit({ type: "digest", id: command.id, digest });
    } catch (error) {
      emit({ type: "error", id: command.id, code: "digest_failed", message: error instanceof Error ? error.message : "Digest generation failed." });
    }
    return true;
  }

  if (command.type === "tts_status" || command.type === "tts_configure" || command.type === "tts_speak"
    || command.type === "tts_pause" || command.type === "tts_stop") {
    try {
      if (command.type === "tts_configure") await speech.configure(command.config, command.apiKey);
      else if (command.type === "tts_speak") await speech.speak(command.text);
      else if (command.type === "tts_pause") speech.pauseToggle();
      else if (command.type === "tts_stop") await speech.stop();
      const status = await speech.status();
      emit({
        type: "tts",
        id: command.id,
        configured: status.configured,
        state: status.playing ? (status.paused ? "paused" : "playing") : "idle",
        ...(status.config === undefined ? {} : { config: status.config })
      });
    } catch (error) {
      emit({ type: "error", id: command.id, code: "tts_failed", message: error instanceof Error ? error.message : "Read mode failed." });
    }
    return true;
  }

  if (command.type === "draft_accept" || command.type === "draft_reject") {
    const draft = pendingDrafts.get(command.draftId);
    if (draft === undefined) {
      emit({ type: "error", id: command.id, code: "draft_unavailable", message: "That draft is no longer available." });
      return true;
    }
    if (command.type === "draft_reject") {
      pendingDrafts.delete(command.draftId);
      emit({ type: "draft_saved", id: command.id, draftId: command.draftId, kind: draft.kind === "integration" ? "integration" : "template" });
      return true;
    }
    try {
      const kind = installDraft(configRoot, draft);
      pendingDrafts.delete(command.draftId);
      templates = loadAllTemplates();
      emit({ type: "draft_saved", id: command.id, draftId: command.draftId, kind });
      if (kind === "integration") emit({ type: "integrations", id: command.id, integrations: publicIntegrations() });
      else emit({
        type: "ready",
        protocolVersion: PROTOCOL_VERSION,
        templates: templates.map(({ manifest, instructions }) => ({ ...manifest, instructions })),
        integrations: publicIntegrations()
      });
    } catch (error) {
      emit({ type: "error", id: command.id, code: "draft_install_failed", message: error instanceof Error ? error.message : "The draft could not be installed." });
    }
    return true;
  }

  if (command.type === "draft_start") {
    emit({ type: "draft_state", id: command.id, state: "working" });
    try {
      const draft = await runDraftAgent(command.kind, command.request, pluginRoot, command.kind === "integration" ? 300_000 : 180_000);
      pendingDrafts.set(command.id, draft);
      while (pendingDrafts.size > 8) pendingDrafts.delete(pendingDrafts.keys().next().value as string);
      emit({ type: "draft", id: command.id, draft });
    } catch (error) {
      emit({
        type: "error",
        id: command.id,
        code: "draft_failed",
        message: error instanceof Error ? error.message : "The drafting agent failed."
      });
    }
    return true;
  }

  if (command.type === "handoff_default_agent") {
    try {
      await launchDefaultAgent(command.prompt);
      emit({ type: "handoff", id: command.id, state: "launched" });
    } catch {
      emit({ type: "error", id: command.id, code: "handoff_failed", message: "The default agent could not be launched." });
    }
    return true;
  }

  if (command.type === "integration_setup") {
    const discovered = discoverIntegrations(integrationRoots.bundled, integrationRoots.user, integrationRoots.state);
    const integration = discovered.find((candidate) => candidate.manifest.id === command.integrationId);
    if (integration === undefined) {
      emit({ type: "error", id: command.id, code: "integration_unavailable", message: "That integration is unavailable." });
      return true;
    }
    try {
      await integrationRuntime.configure(integration, command.values);
      const status = await integrationRuntime.status(integration);
      emit({ type: "integration_setup", id: command.id, integrationId: command.integrationId, ready: status.ready, message: status.message });
    } catch (error) {
      emit({ type: "integration_setup", id: command.id, integrationId: command.integrationId, ready: false, message: error instanceof Error ? error.message : "Setup failed" });
    }
    return true;
  }

  if (command.type === "integration_set_enabled") {
    const integrations = publicIntegrations();
    if (!integrations.some((integration) => integration.id === command.integrationId)) {
      emit({ type: "error", id: command.id, code: "integration_unavailable", message: "That integration is unavailable." });
      return true;
    }
    try {
      if (command.enabled) {
        const discovered = discoverIntegrations(integrationRoots.bundled, integrationRoots.user, integrationRoots.state);
        const target = discovered.find((integration) => integration.manifest.id === command.integrationId);
        if (target === undefined) throw new Error("That integration is unavailable");
        const status = await integrationRuntime.status(target);
        if (!status.ready) throw new Error(status.message || "Set up this integration before enabling it");
      }
      setIntegrationEnabled(integrationRoots.state, command.integrationId, command.enabled);
      emit({ type: "integrations", id: command.id, integrations: publicIntegrations() });
    } catch (error) {
      emit({
        type: "error",
        id: command.id,
        code: "integration_state_failed",
        message: error instanceof Error ? error.message : "The integration setting could not be saved."
      });
    }
    return true;
  }

  try {
    emit({ type: "template_selected", id: command.id, selection: selectTemplate(templates, command.context) });
  } catch (error) {
    emit({
      type: "error",
      id: command.id,
      code: "template_unavailable",
      message: error instanceof Error ? error.message : "No digest template is available."
    });
  }
  return true;
}

function launchDefaultAgent(prompt: string): Promise<void> {
  return new Promise((resolveLaunch, rejectLaunch) => {
    const child = execFile("omarchy", ["agent", "prompt", prompt], {
      timeout: 10_000,
      windowsHide: true
    }, (error) => error === null ? resolveLaunch() : rejectLaunch(error));
    child.unref();
  });
}

export async function runBroker(): Promise<void> {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.trim() === "") continue;
    if (!await handle(line)) break;
  }
}
