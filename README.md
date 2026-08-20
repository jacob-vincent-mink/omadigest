<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/omadigest-mark.svg">
    <img src="assets/omadigest-mark-on-light.svg" width="144" height="144" alt="OmaDigest quill mark">
  </picture>
</p>

<h1 align="center">OmaDigest</h1>

<p align="center"><strong>Turn interruptions into cited, skill-shaped briefings for Omarchy.</strong></p>

<p align="center">
  <a href="https://github.com/jacob-vincent-mink/omadigest/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jacob-vincent-mink/omadigest/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-e6a700">
  <img alt="Omarchy Quattro" src="https://img.shields.io/badge/Omarchy-Quattro-7c3aed">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2ea44f"></a>
</p>

OmaDigest is a native Omarchy attention layer. It observes the existing notification service, applies deterministic privacy policy before persistence, optionally gathers bounded context from removable integrations, selects a user-owned briefing template, and asks a tightly scoped Pi agent for a structured digest with source citations.

It does **not** replace the notification daemon or put a general-purpose agent inside the shell.

> **Status:** Beta. Core notification intake, privacy enforcement, digest generation, template and integration authoring, explicit agent handoffs, DND re-entry, scheduling, Voxtype input, and provider-based read-aloud are implemented. See the remaining [release validation](TODO.md).

## Highlights

- **Briefings, not another inbox** — answer “what needs me?” instead of replaying every popup.
- **Privacy before persistence** — protected apps such as Signal start at **Ignore**; unknown apps start at **Count only**, with content erased.
- **Citations by construction** — every factual digest entry must cite a supplied notification or connector source ID.
- **Deterministic templates** — TypeScript, not the model, chooses the governing briefing skill.
- **Describe, review, accept** — scoped agents draft readable templates and self-contained integrations for explicit review.
- **Sandboxed connector boundary** — integrations are disabled by default, permission-declared, removable, time-bounded, and run outside Quickshell.
- **Explicit action handoff** — send one cited digest item to the default Omarchy agent, or continue broader authoring work in Herdr.
- **Focus re-entry** — automatically generate after DND ends, at an optional daily time, or manually from the panel.
- **Voice both ways** — dictate authoring requests with Voxtype and optionally read completed digests aloud.
- **Inspectable configuration** — privacy, templates, integrations, permissions, setup, and enablement are file-backed and hot-reloadable.
- **Theme-native UI** — the Quickshell panel, spacing, typography, and monochrome mark follow the active Omarchy theme.

## Install

### Requirements

- Omarchy Quattro with shell plugin support
- Node.js 22 or newer available as `node`
- an AI account connected in OmaDigest: Codex/ChatGPT, OpenAI, or Grok/xAI

Optional features:

- [Voxtype](https://github.com/jacob-vincent-mink/voxtype) for dictation
- `secret-tool` for integration and TTS secrets
- `mpv` for read-aloud playback
- `herdr` for explicit extended authoring handoff
- `gh` only for a user-installed integration that declares and uses GitHub CLI access

### Add the plugin

```bash
omarchy plugin add https://github.com/jacob-vincent-mink/omadigest.git --enable
```

OmaDigest is a bar widget and defaults to the right section. If needed, place it explicitly:

```bash
omarchy bar put io.github.jacob-vincent-mink.omadigest --section right
```

Normal installation uses the checked-in broker bundle. It does not run npm, install hooks, invoke a package manager, or request privileges.

### First run

1. Click the quill in the Omarchy bar.
2. Open **Settings → Connections** and connect the model account OmaDigest should use.
3. Review **Settings → Privacy** before allowing notification content into digests.
4. Let attention items accumulate, then press **+** to generate the first digest.
5. Optionally configure integrations, draft a custom template, or set the widget's daily schedule in Omarchy's bar settings.

Read the [usage guide](docs/usage.md) for the complete workflow.

## Update or remove

```bash
omarchy plugin update io.github.jacob-vincent-mink.omadigest --yes
omarchy plugin remove io.github.jacob-vincent-mink.omadigest --yes
```

Removing the plugin removes its executable plugin folder but deliberately leaves user-owned configuration and digest state in place. To erase those too:

```bash
rm -rf "${XDG_CONFIG_HOME:-$HOME/.config}/omadigest" \
       "${XDG_STATE_HOME:-$HOME/.local/state}/omadigest"
```

Review the paths before running the removal command. Secret Service credentials may be removed separately with your desktop's credential manager.

## How it works

```text
Omarchy notifications ─┐
Enabled integrations ──┼─► privacy filter ─► bounded attention store
                       │                           │
Quickshell panel ◄─────┘                           ▼
       │ NDJSON                          deterministic template router
       ▼                                           │
TypeScript broker ─────────────────────► scoped Pi session
       │                                           │ emit_digest only
       ├─ Secret Service                           ▼
       ├─ Voxtype                          validated cited digest
       └─ TTS provider + mpv
```

The QML plugin is presentation-only. A bundled TypeScript broker owns policy, persistence, routing, scoped model sessions, connector execution, authentication, voice, and explicit handoffs.

## Security and privacy

OmaDigest gives each model session only the structured submission tool needed for its task:

| Session | Available tools |
|---|---|
| Digest generation | `emit_digest` |
| Template drafting | `emit_template_draft`, `out_of_scope` |
| Integration drafting | `emit_integration_draft`, `out_of_scope` |

These sessions receive no Pi `bash`, `read`, `write`, `edit`, browser, web, or device tools. Broader work starts only after **Open in default agent**, **Send to agent**, or **Continue in Herdr** is clicked.

Generated integrations are schema-validated, syntax-checked, shown for review, installed only after acceptance, and remain disabled until separately configured and enabled. Connectors use Node's permission model, a minimal environment, bounded I/O, and timeouts. Omarchy plugins themselves share the user's long-running shell process and are not an OS security boundary; review plugin code before installing it.

See [Security policy](SECURITY.md) and the detailed [security model](docs/security.md).

## Templates and integrations

A template keeps human-readable instructions beside deterministic routing policy:

```text
templates/<id>/
├── SKILL.md
└── template.compiled.json
```

An integration is one removable package:

```text
integrations/<integration-id>/
├── manifest.json
├── connector.mjs
├── connector.test.mjs
└── README.md
```

The bundled Google Calendar integration uses a calendar's **Secret address in iCal format**, stored in Secret Service. It emits bounded event metadata—not the secret URL, descriptions, attendees, or attachments.

## Documentation

| Guide | Contents |
|---|---|
| [Usage](docs/usage.md) | Main workflow, settings, automatic generation, handoffs, and troubleshooting |
| [Configuration](docs/configuration.md) | File-backed control plane and hot reload |
| [Templates](docs/templates.md) | Skill format, routing, drafting, and acceptance |
| [Integrations](docs/integrations.md) | Connector contract, permissions, setup, and removal |
| [Voice](docs/voice.md) | Voxtype input and provider-based read mode |
| [Architecture](docs/architecture.md) | QML/broker boundary, protocols, and data flow |
| [Security](docs/security.md) | Threat boundaries, privacy modes, credentials, and sandbox limits |
| [Development](docs/development.md) | Repository layout, checks, smoke tests, and release requirements |

## Development

```bash
git clone git@github.com:jacob-vincent-mink/omadigest.git
cd omadigest
npm ci
npm run check
npm audit
node --test integrations/*/connector.test.mjs
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml components/*.qml
```

`node_modules` contains symlinks that the Omarchy plugin validator intentionally rejects. Validate a clean checkout or temporarily keep `node_modules` outside the repository:

```bash
omarchy plugin validate "$PWD"
```

See [Contributing](CONTRIBUTING.md), [Development](docs/development.md), and [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE) © 2026 Jacob Mink
