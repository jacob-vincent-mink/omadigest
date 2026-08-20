# Architecture

## Shell ownership

OmaDigest is one third-party Omarchy `bar-widget`. It uses the first-party `omarchy.notifications` service and a nested `Panel`; it is not a notification daemon, replacement bar, service plugin, or second Quickshell process.

QML owns presentation, focus, theme bindings, and bounded snapshots of public shell models. One TypeScript broker owns every long-running, filesystem, process, credential, model, connector, and network operation. They exchange one compact JSON object per line over stdin/stdout.

## Data path

```text
notification popupModel ─► QML snapshot ─► attention_ingest
                                              │
enabled connector ─► normalized context ──────┤
                                              ▼
                                      bounded attention store
                                              │
                                  deterministic template selection
                                              │
                                       ephemeral Pi session
                                              │ emit_digest
                                              ▼
                                      structured cited digest
```

Attention items carry stable ID, source, app, bounded title/body, content-availability state, urgency, and timestamp. The broker keeps at most 500 in memory and seven daily mode-`0600` JSONL segments. Deterministic routing may use aggregate application counts from count-only records, but generation excludes individual contentless evidence before model context assembly and again at the model boundary, then applies the selected template's stricter item budget.

## Pi runtime

The broker embeds `@earendil-works/pi-coding-agent` and exposes Pi's typed provider authentication through **Settings → Connections**. Codex/ChatGPT and Grok OAuth open in the system browser; OpenAI and xAI API-key prompts stay inside the panel. Credentials and the selected provider live in OmaDigest's private configuration rather than the shell or QML process. The runtime disables model-network catalog refresh and discovers no user extensions, project instructions, or unrelated skills.

Every Pi operation uses an in-memory session and settings. The selected digest or template skill is injected directly into the system prompt; Pi's probabilistic skill invocation does not govern routing. Integration authoring instead launches the default coding agent with a dedicated skill and exact paths to the package protocol and validator.

### Session capabilities

- Digest: `emit_digest`.
- Template draft: `emit_template_draft`, `out_of_scope`.

No built-in coding tools are enabled. Time, prompt, file, item, and output bounds are enforced outside the model.

## File-backed control plane

User policy, templates, integrations, declared permissions, enablement, and non-secret setup live under `${XDG_CONFIG_HOME:-~/.config}/omadigest`. The broker fingerprints this bounded tree every two seconds. Valid edits made by the default Omarchy agent or another editor are reloaded and published to QML without restarting the shell. Secrets remain outside this control plane in Secret Service, and provider account changes remain behind typed authentication.

Destructive data controls are typed broker commands with UI confirmation. Notification-history deletion removes only OmaDigest attention evidence and persists a bounded cutoff that rejects replayed older Omarchy notifications; it never mutates Omarchy notification state. Integration deletion removes user packages, setup, enablement, and known integration secrets. Bundled templates and integrations remain immutable.

## Templates

Templates have readable `SKILL.md` instructions and a schema-validated compiled policy. TypeScript evaluates all triggers and displays reasons. Manual Quickshell edits and constrained-agent revisions both cross typed broker commands, preserve the template ID, and install atomically. Accepted user templates overlay bundled IDs from the XDG configuration directory; deleting custom templates resets edited defaults by removing those overlays.

## Integrations

An integration is discovered only when its directory, strict manifest, and regular `.mjs` entry point validate. Default-agent authoring occurs in a temporary staging directory; a standalone broker-owned command enforces file, byte, path, schema, syntax, sandbox-test, and protocol-probe gates before atomic installation. The packaged authoring skill can be explicitly linked into shared Codex, Claude, and Pi-compatible skill directories; plugin installation itself still runs no hook. Enablement is separate state from live probe status. Setup fields are manifest-driven; secrets go to Secret Service and ordinary values to private JSON.

Connectors run as child processes with a minimal environment and versioned NDJSON request. Node permissions are derived from declared filesystem/network/command needs. Results are bounded and validated before becoming attention items. Generation runs only connector IDs explicitly named by the selected template. Connector failure is isolated and does not fail notification intake.

The model never receives connector credentials or raw connector protocol messages.

## Draft acceptance

Agent drafts remain in broker memory. The UI displays their complete structured proposal. Acceptance writes a sibling staging directory, validates/syntax-checks it, and atomically renames it into user configuration. Replacing a package creates a temporary rollback backup. Integration acceptance never enables the package.

## Voice

Voxtype owns microphone capture and transcription. OmaDigest requests a private output file and turns off auto-submit. The broker appends only the final bounded transcript to the editor.

Read mode is a separate provider boundary. It supports OpenAI-compatible speech and ElevenLabs adapters, stores keys in Secret Service, and plays private temporary audio through `mpv`.

## Runtime protocol

Protocol 1 currently includes:

- initialize and shutdown;
- template selection;
- attention ingestion and digest generation;
- template drafting, acceptance, rejection, and handoff;
- default-agent integration-authoring handoff;
- integration setup and enablement;
- deletion of OmaDigest digest history, retained notification evidence, custom integrations, and custom templates;
- dictation status/start/stop/cancel;
- TTS status/configure/speak/pause/stop.

Unknown or malformed commands fail closed with a bounded error event.

## Distribution

Omarchy plugin installation performs no dependency hook. Releases check in a reproducible executable broker bundle, pinned lockfile, source, source map, license inventory, QML, skills, templates, and connector packages. A missing runtime capability produces an actionable unavailable state rather than downloading code.
