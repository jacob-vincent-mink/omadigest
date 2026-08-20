<p align="center">
  <img src="assets/omadigest-mark-preview.png" width="112" alt="OmaDigest quill mark">
</p>

# OmaDigest

**A native Omarchy attention layer that turns interruptions into cited, skill-shaped briefings.**

OmaDigest listens to Omarchy's existing notification service, groups bounded attention items, selects a user-owned briefing template, optionally enriches the relevant items through removable integrations, and asks a tightly scoped Pi agent to produce a structured digest. It does not replace the notification daemon or expose a general-purpose agent inside the shell.

> **Development status:** functional early MVP. Template routing, generated template/integration drafts, Voxtype dictation, notification intake, structured digest generation, integration setup/enablement, Google Calendar context, and remote read mode have implementation paths. The UI and release packaging still need live-system QA before marketplace publication.

## What makes it different

- **Briefings, not another notification history.** It answers “what needs me?” instead of repeating every popup.
- **Skills you can describe.** Tell the drafting agent what kind of digest you want; review its readable `SKILL.md` and deterministic trigger policy before accepting it.
- **Real context, selectively.** A notification can route OmaDigest to an enabled calendar or developer-tool integration without granting blanket desktop access.
- **Citations by construction.** The model submits a typed digest, and every factual entry must cite a supplied source ID.
- **Theme-native.** The Quickshell surface and monochrome quill mark inherit the active Omarchy colors, spacing, type, corners, and panel behavior.
- **Voice both ways.** Voxtype can dictate template/integration requests. Read mode speaks a completed digest through an OpenAI-compatible speech endpoint or ElevenLabs.

## Safety model

OmaDigest uses separate, narrow sessions:

| Session | Tools available |
|---|---|
| Digest generation | `emit_digest` only |
| Template drafting | `emit_template_draft`, `out_of_scope` |
| Integration drafting | `emit_integration_draft`, `out_of_scope` |

These sessions receive no Pi `bash`, `read`, `write`, `edit`, browser, web, or device tools. An unrelated drafting request can only propose a prompt for the system's default agent. OmaDigest launches that prompt through `omarchy agent prompt` only after the user presses **Open in default agent**.

Every digest entry also has **Send to agent**. This is an explicit handoff to the default Omarchy agent with the selected digest item and its retained cited notifications or connector records. Crash notifications include the originating application and timestamp so the agent can invoke the `diagnose-crash` workflow and correlate the correct systemd-coredump instead of guessing from the summary.

Generated integrations are staged as complete directories, schema-validated, syntax-checked, displayed for review, installed only after acceptance, and remain disabled until separately configured and enabled. Connector processes run outside Quickshell with Node's permission model, minimal environment, bounded I/O, and timeouts. See [Security](docs/security.md) for the honest limits.

## Architecture

```text
Omarchy notifications ─┐
Enabled integrations ──┼─► bounded attention store
                       │          │
Quickshell panel ◄─────┘          ▼
       │ NDJSON          deterministic template router
       ▼                            │
TypeScript broker ───────► scoped Pi session ─► emit_digest
       │                                          │
       ├─ Secret Service                          ▼
       ├─ Voxtype                         validated cited digest
       └─ TTS provider + mpv
```

Read the full [architecture](docs/architecture.md).

## Install for development

Requirements:

- Omarchy Quattro with shell plugin support
- Node.js 22 or newer
- a supported provider account; connect Codex/ChatGPT, OpenAI, or Grok from **Settings → Connections**
- optional: Voxtype for dictation
- optional: `secret-tool` and `mpv` for read mode and integration secrets

```bash
git clone https://github.com/jacob-vincent-mink/omadigest.git
cd omadigest
npm ci
npm run check
omarchy plugin validate "$PWD"
```

A marketplace release checks in the executable broker bundle. Normal `omarchy plugin add` installation must not run npm, install hooks, or privileged commands.

## Templates

A template has a human layer and a machine layer:

```text
templates/<id>/
├── SKILL.md
└── template.compiled.json
```

Users operate on the readable skill and a plain-language activation preview. The drafting agent produces the compiled policy; TypeScript validates and evaluates it deterministically. A manual generation-time override always wins.

See [Templates](docs/templates.md).

## Integrations

Every integration is one removable package:

```text
<integration-id>/
├── manifest.json
├── connector.mjs
├── connector.test.mjs
└── README.md
```

Removing a user integration directory removes its code. Enablement and secrets live outside the package, so stale state cannot execute missing code. Integrations start disabled.

The bundled Google Calendar integration uses the calendar's **Secret address in iCal format**, stored in Secret Service. It emits only bounded event metadata—not the secret URL, descriptions, attendees, or attachments.

See [Integrations](docs/integrations.md).

## Voice and read mode

- Draft editors use Voxtype's external recording mode and append the resulting transcript without auto-submitting it.
- Read mode receives only the completed digest presentation text.
- The baseline adapter uses the de facto OpenAI-compatible `POST /v1/audio/speech` contract.
- ElevenLabs uses its native text-to-speech endpoint.
- Ollama is not treated as a TTS API. A local server works when it implements the OpenAI speech endpoint.
- Audio is temporary, played through `mpv`, and deleted when playback exits.

See [Voice and read mode](docs/voice.md).

## Development

```bash
npm run typecheck
npm test
npm run build
npm audit
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml components/*.qml
omarchy plugin validate "$PWD"
node --test integrations/*/connector.test.mjs
```

See [Development](docs/development.md) and [`AGENTS.md`](AGENTS.md).

## License

MIT
