# Using OmaDigest

## Main screen

The bar's quill opens a deliberately small digest list. The header actions are:

- **+** — generate from currently available attention items;
- **✓** — mark the current backlog seen without deleting policy-permitted retained evidence;
- **Settings** — open integrations, templates, privacy, and connections.

Select a digest to open its focused reader. Each entry includes source citations and, where policy allows, **Send to agent**.

## Connect a model

Open **Settings → Connections → Connect OmaDigest** and choose one of the discovered Pi authentication methods:

- Codex/ChatGPT browser sign-in;
- OpenAI API key;
- Grok/xAI API key.

Browser authentication returns through the broker's local callback. API-key entry stays inside the OmaDigest panel. Provider authentication is kept separate from integration and TTS credentials.

## Notification privacy

Open **Settings → Privacy** before enabling notification content. Policy is enforced before persistence or model submission.

| Mode | Retained | May reach digest AI | May accompany Send to agent |
|---|---:|---:|---:|
| Ignore | Nothing | No | No |
| Count only | Count, with content erased | No | No |
| Digest | Policy-permitted content | Yes | No |
| Digest + agent | Policy-permitted content | Yes | Yes, after a click |

Protected private applications such as Signal start at **Ignore**. Unknown applications start at **Count only**. Tightening a rule rewrites retained segments to erase content no longer permitted by the policy.

## Generate a digest

OmaDigest has three trigger paths:

1. **Manual** — press **+** when attention items are available.
2. **DND ended** — after Do Not Disturb ends, generate when the configured minimum item count is met.
3. **Daily schedule** — the optional local `HH:MM` widget setting triggers once per day when enough items are available.

The broker applies privacy, bounds the input, gathers enabled integration context, and selects a template deterministically. Successful generation marks the cited input seen while retaining permitted evidence for later correlation.

A generation-time template override, when shown, wins over normal routing. The model never chooses its own governing template.

## Templates

Open **Settings → Templates** to inspect installed skills or create one from a plain-language request.

1. Describe the briefing's purpose, triggers, sources, sections, and limits.
2. Optionally dictate with Voxtype; dictation never auto-submits.
3. Press **Draft template**.
4. Review the readable instructions and compiled matching policy.
5. Accept or discard the complete draft.

The scoped drafting session cannot edit files or browse the system. If the request is unrelated it can only propose an explicit default-agent handoff. If legitimate authoring needs broader follow-up, **Continue in Herdr** transfers the request and a bounded draft snapshot to a dedicated workspace after confirmation.

## Integrations

Open **Settings → Integrations** to inspect, configure, enable, disable, or remove connector packages.

A generated integration is reviewed as a complete package, including its manifest, connector, tests, documentation, requested hosts, commands, and filesystem paths. Acceptance installs it disabled. Configuration and enablement are separate user actions.

The bundled Google Calendar connector asks for a Secret iCal URL and stores it in Secret Service. Connector cards show readiness and actionable setup errors without exposing secrets.

## Agent actions

**Send to agent** passes one digest entry, its cited policy-permitted evidence, source timestamps, and explicit safety framing to the default Omarchy agent. Notification and connector strings are treated as untrusted observations, not instructions.

Crash entries ask the default agent to use the `diagnose-crash` workflow and correlate the application and timestamp with systemd-coredump.

Authoring views expose two broader handoffs:

- **Open in default agent** for work the scoped session classified as unrelated;
- **Continue in Herdr** for explicit extended template or integration work.

Neither starts automatically.

## Voice and read aloud

Voxtype can append dictation to template and integration requests. OmaDigest does not submit the transcript until the normal draft action is pressed.

Read-aloud controls appear only after a TTS adapter is configured under **Settings → Connections → Read aloud**. Supported adapters are OpenAI-compatible speech endpoints and ElevenLabs. Completed presentation text—not raw notifications—is sent to TTS. Temporary audio is deleted when `mpv` exits.

## Data locations

```text
${XDG_CONFIG_HOME:-~/.config}/omadigest/   policy, templates, integrations, setup, enablement
${XDG_STATE_HOME:-~/.local/state}/omadigest/ attention segments and digest history
```

Provider authentication and secrets are intentionally not part of the editable configuration tree. See [configuration](configuration.md) for the complete file contract.

## Troubleshooting

### The quill is not in the bar

```bash
omarchy plugin list --json | jq '.[] | select(.id == "io.github.jacob-vincent-mink.omadigest")'
omarchy bar put io.github.jacob-vincent-mink.omadigest --section right
```

If the plugin is installed but undiscovered:

```bash
omarchy-shell shell rescanPlugins
```

### The panel reports that no model is connected

Open **Settings → Connections** and complete a supported authentication flow. A web subscription and an API credential are not interchangeable; use the method shown for that provider.

### No digest is generated after DND

Confirm that DND has ended, enough policy-permitted/countable items exist, and the widget's minimum item setting is met. Open OmaDigest once after installation so the bar widget is active. Manual **+** generation remains available.

### An integration is unavailable

Open its card and check setup, permission declarations, external executable availability, and readiness. Integrations remain disabled after installation until configured and explicitly enabled.

### Inspect shell errors

```bash
qs log -p "$OMARCHY_PATH/shell" --tail 100
```
