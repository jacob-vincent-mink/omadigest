<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/omadigest-mark.svg">
    <img src="assets/omadigest-mark-on-light.svg" width="144" height="144" alt="OmaDigest quill mark">
  </picture>
</p>

<h1 align="center">OmaDigest</h1>

<p align="center"><strong>Your brain on Omarchy.</strong></p>

<p align="center">
  <a href="https://github.com/jacob-vincent-mink/omadigest/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/jacob-vincent-mink/omadigest/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Status: beta" src="https://img.shields.io/badge/status-beta-e6a700">
  <img alt="Omarchy Quattro" src="https://img.shields.io/badge/Omarchy-Quattro-7c3aed">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-2ea44f"></a>
</p>

OmaDigest is a native Omarchy attention layer and background agent. Built around a custom harness using [Pi](https://github.com/earendil-works/pi), it observes the existing notification service, applies deterministic privacy policy before persistence, optionally gathers bounded context from removable integrations, selects a user-owned briefing template, and asks a tightly scoped agent for a structured digest with source citations. When you need to focus, OmaDigest handles the feed without taking over the rest of your computer.

It does **not** replace the notification daemon or put a general-purpose agent inside the shell.

> **Status:** Beta. The release demo exercises notification intake, privacy, DND re-entry, digest generation, source controls, template suggestions and authoring, deterministic routing, and default-agent integration authoring. Dictation, scheduling, and read-aloud remain optional beta surfaces.

## Highlights

- **Briefings, not another inbox** — answer “what needs me?” instead of replaying every popup.
- **Privacy before persistence** — protected apps such as Signal start at **Ignore**; unknown apps start at **Count only**, with content erased.
- **Citations by construction** — every factual digest entry must cite a supplied notification or connector source ID.
- **Deterministic templates** — TypeScript, not the model, chooses the governing briefing skill.
- **Attention intelligence** — conservative subject grouping, broker-owned intent routing, signal-aware DND triggers, and safe pattern-based template suggestions make the defaults improve without granting notification text authority.
- **Templates stay yours** — edit instructions and routing JSON directly, or ask the constrained in-panel agent for a validated revision; editing a packaged default creates a resettable user overlay.
- **Right-sized authoring** — a scoped session drafts readable templates in-panel; integration requests open the default coding agent with a dedicated skill and a validated, disabled-by-default install path.
- **Sandboxed connector boundary** — integrations are disabled by default, permission-declared, removable, time-bounded, and run outside Quickshell.
- **Useful sources out of the box** — native Omarchy notifications and focus state, live-tested GitHub metadata, local crash and update state, system telemetry, and Herdr agent activity.
- **Category-level control** — keep a source enabled while turning off noisy streams such as completed tasks, network transitions, or account activity.
- **Explicit action handoff** — send one cited digest item to the default Omarchy agent, or continue broader authoring work in Herdr.
- **Focus re-entry** — automatically generate after DND ends, at an optional daily time, or manually from the panel.
- **Voice both ways** — dictate authoring requests with Voxtype and optionally read completed digests aloud.
- **Inspectable configuration** — privacy, templates, integrations, permissions, setup, and enablement are file-backed and hot-reloadable.
- **Theme-native UI** — the Quickshell panel, spacing, typography, and monochrome mark follow the active Omarchy theme.

## Demo

https://github.com/user-attachments/assets/1bfaaf85-1480-4b9f-a62c-b098f96d96a1

Music: “Study and Relax” by Kevin MacLeod, from the [FreePD archive](https://github.com/0lhi/FreePD/blob/cf011c7016595833b550a88ff127f089188b25f8/Miscellaneous/Study%20and%20Relax.mp3), dedicated to the public domain under [CC0 1.0](https://github.com/0lhi/FreePD/blob/cf011c7016595833b550a88ff127f089188b25f8/LICENSE). See [Third-party materials](THIRD_PARTY_NOTICES.md) for all preview and demo-media credits.

## Install

### Requirements

- Omarchy Quattro with shell plugin support
- Node.js 22 or newer available as `node`
- Bubblewrap available as `bwrap` for the connector sandbox (included with Omarchy)
- an AI account connected in OmaDigest: Codex/ChatGPT, OpenAI, or Grok/xAI

Optional features:

- [Voxtype](https://github.com/jacob-vincent-mink/voxtype) for dictation
- `secret-tool` for integration and TTS secrets
- `mpv` for read-aloud playback
- `herdr` for explicit extended authoring handoff
- `gh` for the bundled, read-only GitHub notification integration

The complete lockfile-derived dependency license inventory and demo-media credits are documented in [Third-party materials](THIRD_PARTY_NOTICES.md).

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
5. Optionally configure sources and their categories, draft a custom template, or set the widget's daily schedule in Omarchy's bar settings.

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

These Pi sessions receive no `bash`, `read`, `write`, `edit`, browser, web, or device tools. Integration authoring is deliberately different: OmaDigest opens the default coding agent with its authoring skill, which builds in a temporary directory and must pass the standalone package validator before an atomic, disabled install. Broader work starts only after **Build in default agent**, **Open in default agent**, **Send to agent**, or **Continue in Herdr** is clicked.

Generated integrations are schema-validated, syntax-checked, tested in the connector sandbox, probed with mocked inputs, installed atomically, and remain disabled until separately configured and enabled. Connectors use Node's permission model, a minimal environment, bounded I/O, and timeouts. Omarchy plugins themselves share the user's long-running shell process and are not an OS security boundary; review plugin code before installing it.

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

The bundled GitHub integration uses fixed read-only broker calls through the user's authenticated `gh` session and is exercised end to end in the demo; its connector receives neither a token nor process/network authority. Broker-native Omarchy sources cover bounded crash metadata, update availability, system telemetry, and Herdr agent transitions. Every source exposes category controls and a non-mutating status check; all start disabled except the existing Notifications and Focus/DND inputs. Calendar, chat, task, and social applications still participate through native notifications and per-app privacy rules. See the [integration guide](docs/integrations.md) for the verified release scope and deliberately unbundled connectors.

## Documentation

| Guide | Contents |
|---|---|
| [Usage](docs/usage.md) | Main workflow, settings, automatic generation, handoffs, and troubleshooting |
| [Configuration](docs/configuration.md) | File-backed control plane and hot reload |
| [Templates](docs/templates.md) | Skill format, routing, drafting, and acceptance |
| [Integrations](docs/integrations.md) | Connector contract, permissions, setup, and removal |
| [Attention intelligence](docs/intelligence.md) | Intent classification, grouping, automatic triggers, and safe template suggestions |
| [Voice](docs/voice.md) | Voxtype input and provider-based read mode |
| [Architecture](docs/architecture.md) | QML/broker boundary, protocols, and data flow |
| [Security](docs/security.md) | Threat boundaries, privacy modes, credentials, and sandbox limits |
| [Threat model](docs/threat-model.md) | L0/L1/L2 boundaries, STRIDE assessment, adversarial tests, and residual risks |
| [Development](docs/development.md) | Repository layout, checks, smoke tests, and release requirements |

## Why OmaDigest

I am a believer in the agentic OS: a malleable computer where much of an application can be a focused interface backed by an agent with the right context and narrowly chosen tools. OmaDigest is an experiment in that shape. The Quickshell frontend stays small; the custom harness does the bounded collection, correlation, routing, and summarization behind it.

The notification stream is a useful place to start because it already contains cross-application context, but usually presents it as isolated interruptions. An agent can collate related events, surface just-in-time information, and reduce context switching without becoming the main thing the user does with the computer.

## Future plans

- Just-in-time briefs, such as gathering relevant project context before an upcoming meeting.
- Deeper correlation across notifications, connectors, local system state, and agent activity.
- More live-tested integrations with ordinary-user authentication.
- Repeatable connector instances for sources such as multiple RSS feeds or calendars.
- A way for integrations to ship independently, potentially by building on Omarchy's existing plugin system.

## Development

The MVP was built in one day on August 20, 2026 using Codex with GPT-5.6 Sol and Herdr.

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

## License and third-party materials

[MIT](LICENSE) © 2026 Jacob Mink. See [Third-party materials](THIRD_PARTY_NOTICES.md) for dependency licenses and demo-media credits.
