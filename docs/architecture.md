# Architecture

## Shell ownership

OmaDigest is one third-party Omarchy `bar-widget`. It uses the first-party `omarchy.notifications` service and a nested `Panel`; it is not a notification daemon, replacement bar, service plugin, or second Quickshell process.

QML owns presentation, focus, theme bindings, and bounded snapshots of public shell models. One TypeScript broker owns every long-running, filesystem, process, credential, model, connector, and network operation. They exchange one compact JSON object per line over stdin/stdout.

## Data path

```text
live popupModel ─► bounded QML snapshot ─► attention_ingest
Omarchy history ─► bounded broker reader ─► attention store
                                              │
enabled connector ─► normalized context ──────┤
scheduled research ─► cited claim changes ─────┤
                                              ▼
                                      bounded attention store
                                              ├─► standing policy matcher
                                              ├─► stable entity correlation
                                              ├─► episodic memory ─► temporal summary tree
                                              │                         │ recall / zoom
                                              ▼                         │
                                  bounded attention proposal ◄──────────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                         broker watch    cited digest    native alert
```

Attention items carry stable ID, source, app, bounded title/body, content-availability state, urgency, and timestamp. QML submits only the bounded live popup snapshot; the broker independently reads at most 50 regular non-symlink Omarchy history files under 64-KiB/file and 512-KiB total limits. The broker keeps at most 500 items in memory and seven daily mode-`0600` JSONL segments, deduplicates identical snapshots before append, and enforces 2-MiB segment and 8-MiB total budgets. Count-only records never reach either model. The broker deterministically extracts stable entities, matches validated standing policies, and detects bounded future meeting/deadline times before deliberation. A separate mode-`0600` episodic memory retains at most 512 provenance-preserving evidence, decision, digest, and outcome records for 90 days under 512 KiB; its time-decayed summary tree is derived and rebuildable. The attention agent receives only grouped actionable evidence, a bounded temporal cover, soft outcome-derived preferences, public template summaries, and the results of up to four broker-owned recall calls. The digest agent receives only evidence cited by the validated proposal under that template's stricter budget.

## Pi runtime

The broker embeds `@earendil-works/pi-coding-agent` and exposes Pi's typed provider authentication through **Settings → Connections**. Codex/ChatGPT and Grok OAuth open in the system browser; OpenAI and xAI API-key prompts stay inside the panel. Credentials and the selected provider live in OmaDigest's private configuration rather than the shell or QML process. The runtime disables model-network catalog refresh and discovers no user extensions, project instructions, or unrelated skills.

Every Pi operation uses an in-memory session and settings. Digest and template instructions are injected directly into their system prompts. The attention session may exercise judgment only by submitting one typed proposal; it cannot execute or schedule that proposal itself. Integration authoring instead launches the default coding agent with a dedicated skill and exact paths to the package protocol and validator.

### Session capabilities

- Digest: `emit_digest`.
- Attention: bounded read-only `search_attention_memory`, `read_attention_thread`, and `zoom_attention_memory`, then exactly one `propose_attention_action` (`hold`, `digest`, or `notify`).
- Standing-policy compilation: `emit_attention_policy`.
- Template draft: `emit_template_draft`, `out_of_scope`.
- Research: a user-selected focused, broad, or deep budget (up to 20 `search_web` calls and 60 `read_url` calls), a separate total-corpus bound, then `emit_research_snapshot`.

No built-in coding tools are enabled. Time, prompt, file, item, and output bounds are enforced outside the model.

## File-backed control plane

User privacy rules, standing attention policies, templates, integrations, declared permissions, enablement, category overrides, and non-secret setup live under `${XDG_CONFIG_HOME:-~/.config}/omadigest`. Standing policies are schema-validated, capped at 32 records and 128 KiB, and matched deterministically. Source enablement and category overrides use bounded version-2 state; version-1 integration enablement is migrated on read and rewritten on the next state change. The broker fingerprints this bounded tree every two seconds. Valid edits made by the default Omarchy agent or another editor are reloaded and published to QML without restarting the shell. Secrets remain outside this control plane in Secret Service, and provider account changes remain behind typed authentication.

Research watch definitions also live in that bounded control plane. The broker owns cadence, one-at-a-time execution, depth and freshness profiles, a weighted daily automatic-work budget, public-HTTPS/DNS validation, response and corpus limits, and a 90-day claim ledger capped at 12 runs per watch. Search queries include the current date and effective freshness boundary; fetched pages expose bounded publication metadata, falling back to HTTP `Last-Modified` only when no publication date is present. The model emits stable cited claims; TypeScript computes new, changed, and no-longer-supported claims and turns a baseline or meaningful delta into a normal unread digest.

Destructive data controls are typed broker commands with UI confirmation. Notification-history deletion removes OmaDigest attention evidence, notification-derived memory episodes, and the attention-loop ledger, then persists a bounded cutoff that rejects replayed older Omarchy notifications; it never mutates Omarchy notification state. Privacy tightening removes affected raw evidence and every dependent episode before rebuilding derived memory summaries. Integration deletion removes user packages, setup, enablement, and known integration secrets. Bundled templates and integrations remain immutable; inline deletion of a bundled template records only its bounded ID in user configuration.

Release discovery is also broker-owned. It checks only GitHub's fixed `releases/latest` endpoint for this repository, at most once per 24 hours unless the user explicitly retries. Requests time out after five seconds; response and persisted state are each capped at 64 KiB. QML receives only the normalized current/latest versions, fixed release URL, check time, and per-version dismissal state.

## Templates

Templates have readable `SKILL.md` instructions and a schema-validated compiled policy. TypeScript evaluates all triggers and displays reasons. Manual Quickshell edits and constrained-agent revisions both cross typed broker commands, preserve the template ID, and install atomically. Accepted user templates overlay bundled IDs from the XDG configuration directory. Inline deletion removes an overlay and hides its packaged fallback when present; the bulk template reset removes overlays and restores hidden defaults.

## Integrations

An integration is discovered only when its directory, strict manifest, and regular `.mjs` entry point validate. Default-agent authoring occurs in a temporary staging directory; a standalone broker-owned command enforces file, byte, path, schema, syntax, sandbox-test, and protocol-probe gates before atomic installation. The packaged authoring skill can be explicitly linked into shared Codex, Claude, and Pi-compatible skill directories; plugin installation itself still runs no hook. Enablement is separate state from live probe status. Setup fields are manifest-driven; secrets go to Secret Service and ordinary values to private JSON.

Connectors run as child processes with a minimal environment, versioned NDJSON, no home mount, no direct network namespace, and no child-process permission. HTTPS is a typed broker service with exact declared host/port enforcement, public-address validation, no automatic redirects, and request/byte/time caps. External commands and connector filesystem permissions are rejected. The bundled GitHub source is special-cased as audited trusted code: the broker performs fixed read-only `gh api` calls and passes only bounded data to its unprivileged connector. Results are bounded and validated before becoming attention items. Manifests may declare bounded source categories; legacy manifests receive an implicit enabled `default` category. Background sync requests only user-enabled sources and categories, and undeclared or disabled results are discarded before persistence. Connector failure is isolated and does not fail notification intake.

Public source status is a structured object with `unknown`, `checking`, `ready`, `authentication-required`, `setup-required`, or `error` state, plus bounded message, completion timestamp, and stable connector error code when available. Authentication/setup actions are derived only from concrete manifest setup fields, never connector-controlled strings or URLs.

The model never receives connector credentials or raw connector protocol messages.

## Draft acceptance

Agent drafts remain in broker memory. The UI displays their complete structured proposal. Acceptance writes a sibling staging directory, validates/syntax-checks it, and atomically renames it into user configuration. Replacing a package creates a temporary rollback backup. Integration acceptance never enables the package.

## Voice

Voxtype owns microphone capture and transcription. OmaDigest requests a private output file and turns off auto-submit. The broker appends only the final bounded transcript to the editor.

Read mode is a separate provider boundary. It supports OpenAI-compatible speech and ElevenLabs adapters, stores keys in Secret Service, streams provider audio into an exclusive private file under an incremental 50-MiB cap, and plays the result through `mpv`.

## Runtime protocol

Protocol 2 currently includes:

- initialize and shutdown;
- template selection;
- attention ingestion, deterministic explanation, history search, standing-policy management, feedback, and digest generation;
- template drafting, acceptance, rejection, and handoff;
- default-agent integration-authoring handoff;
- one-use, broker-derived default-agent prompt preview and confirmation;
- integration setup, structured status refresh, source enablement, and category enablement;
- deletion of OmaDigest digest history, retained notification evidence, custom integrations, and custom templates;
- bounded release-update check, per-version dismissal, and fixed release-page launch;
- research-watch create, pause/resume, run-now, delete, and bounded state;
- dictation status/start/stop/cancel;
- TTS status/configure/speak/pause/stop.

Unknown or malformed commands fail closed with a bounded error event.
The broker caps each NDJSON line at 2 MiB before decoding or parsing, discards
an oversized line without retaining its remainder, and resumes at the next
newline. Broad-agent handoff payloads never enter process arguments: argv
contains only a fixed claim instruction and opaque capability, while the
bounded payload crosses a mode-`0600` Unix socket once before expiring.

Quickshell IPC exposes navigation and content-free status in normal operation.
Costful or mutating demo methods are disabled unless the shell was explicitly
started with `OMADIGEST_DEMO_IPC=1`; demo preparation sets that transient user
environment value and restore clears it before restarting the shell.

## Distribution

Omarchy plugin installation performs no dependency hook. Releases check in a reproducible executable broker bundle, pinned lockfile, source, source map, license inventory, QML, skills, templates, and connector packages. A missing runtime capability produces an actionable unavailable state rather than downloading code.
