# Using OmaDigest

## Main screen

The bar's quill opens a deliberately small digest list. The header actions are:

- **+** — generate from currently available, privacy-eligible attention items;
- **✓** — mark the current backlog seen without deleting policy-permitted retained evidence;
- **Settings** — open sources, templates, privacy, connections, and retained data controls.

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

Protected private applications such as Signal start at **Ignore**. Unknown applications start at **Count only**. Add per-app rules using the name shown in native notifications; tightening a rule rewrites retained segments to erase content no longer permitted.

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

Open any installed template to choose **Edit manually** or **Revise with agent**. Manual edits expose both readable instructions and the compiled routing JSON, then pass through broker validation and atomic installation. Agent revisions receive the current template inside the same tool-restricted session, must preserve its ID, show their plan, and return a complete proposal for review. Editing a bundled template creates a user overlay; **Settings → Data → Delete templates** removes overlays and restores packaged defaults.

The scoped drafting session cannot edit files or browse the system. If the request is unrelated, the broker derives a prompt only from the original request and shows the exact bounded prompt before a second confirmation can launch the default agent. If legitimate authoring needs broader follow-up, **Continue in Herdr** transfers the request and a bounded draft snapshot to a dedicated workspace after confirmation.

## Sources

Open **Settings → Sources** for a compact status list. Omarchy-native inputs and connected services are separated; each row shows health, enablement, and a category count. Open a row for status refresh, setup/authentication, the overall on/off control, category switches, and quiet permission details.

Choose **Add source**, describe a new connector, and press **Build in default agent**. OmaDigest opens the user's default coding agent with a dedicated integration-authoring skill and exact local validator commands. The agent builds in a temporary directory; the validator bounds the package, checks its manifest and syntax, runs its tests inside the connector sandbox, performs a mocked protocol probe where possible, and only then installs it atomically. A successful install remains disabled. Configuration, category selection, and enablement are separate user actions back in OmaDigest.

The bundled GitHub connector uses the active authenticated `gh` session and imports bounded unread-notification metadata. **Check status** runs its non-mutating live probe and reports the active GitHub identity without enabling it. Other applications participate through native notifications unless the user installs a separately reviewed custom connector.

**Install agent skill** links the packaged integration-authoring skill into Omarchy's shared and supported agent skill directories. This is an explicit user action rather than a plugin-install hook; handoffs retain an absolute-path fallback if the skill is not linked.

## Agent actions

**Send to agent** passes one digest entry, its cited policy-permitted evidence, source timestamps, and explicit safety framing to the default Omarchy agent. Notification and connector strings are treated as untrusted observations, not instructions.

Crash entries ask the default agent to use the `diagnose-crash` workflow and correlate the application and timestamp with systemd-coredump.

Authoring views expose explicit broader handoffs:

- **Open in default agent** for work the scoped session classified as unrelated;
- **Build in default agent** for a new integration package;
- **Continue in Herdr** when inline template drafting fails or needs extended work.

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

OmaDigest checks its latest stable GitHub release in the background no more than once per day. When a newer semantic version exists, the settings icon gains an accent dot and Settings shows a dismissible release banner. Dismissal applies only to that version, so a later release can notify again. OmaDigest never installs an update itself; **View release** opens the fixed GitHub release page and the user updates through Omarchy.

## Delete retained data

Open **Settings → Data** to delete digest history, OmaDigest's retained notification evidence, custom integrations, custom templates, or all four categories. Every action requires confirmation.

Deleting notification history affects only OmaDigest state. It records an OmaDigest-owned cutoff so older notifications still present in Omarchy are not imported again; Omarchy's own notification history is never changed. Deleting integrations removes custom packages, setup, enablement, and known integration secrets while leaving bundled packages available. **Delete all** does not remove model authentication or privacy rules.

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
