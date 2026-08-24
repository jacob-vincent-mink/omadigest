# Using OmaDigest

## Main screen

The bar's quill opens a deliberately small digest list. The header actions are:

- **+** — check every enabled source and explicitly request a digest from privacy-eligible evidence;
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

1. **Notification quiet window** — review a changed batch after notifications settle.
2. **Enabled sources** — poll connectors and native Omarchy sources in the background and review new evidence.
3. **Native events** — react to configured power, battery, network, and Herdr transitions.
4. **DND ended** — review what changed when Do Not Disturb ends.
5. **Daily schedule** — run the optional local `HH:MM` review once per day.
6. **Conditional watch** — revisit held evidence when a related update arrives, a cited source changes, or the broker-owned deadline expires.
7. **Manual** — press **+** to check all sources and require a digest now.

The panel's compact activity strip shows whether OmaDigest is checking sources, weighing evidence, holding related updates, generating, or surfacing an alert. Active watches list their subject, wake conditions, deadline, and a cancel action. Automatic reviews are rate-limited and daily-budgeted. The model cannot create its own timer or call notification, shell, filesystem, browser, or connector tools.

Before deciding, the attention agent receives a bounded time-decayed view of its recent episodes and may make up to four typed, read-only calls to search, read one broker-supplied subject thread, or zoom into a coarse summary. Recalled history remains cited data, and the final action must include current evidence. This lets OmaDigest compare an evolving PR, meeting, incident, or agent task with what it previously saw without replaying its full history into every model call.

The broker applies privacy, bounds the input, gathers enabled integration context, and filters templates by their compiled eligibility policy. The attention agent may choose among those eligible templates; the broker rejects unavailable or ineligible IDs. Successful generation marks only the cited input seen while retaining permitted evidence for later correlation.

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

Open **Research watches** at the top of Sources to schedule a recurring public-web question. Give it a name, the question to keep current, an hourly-or-slower cadence, a research depth, a freshness window, and up to eight preferred HTTPS sources. Focused research may use 4 searches/12 pages, broad 10/30, and deep 20/60; corpus limits still prevent a collection from overrunning the model context. New watches default to broad research over the last 30 days. Follow-ups narrow freshness to the last successful snapshot when that is more recent. The first run establishes a cited baseline; later runs compare stable claims and create an unread research brief only when the answer meaningfully changes. Existing cards expose depth and freshness behind their settings button. The question, date-aware search terms, and fetched public pages leave the computer; pages are treated as untrusted evidence rather than instructions.

Choose **Add source**, describe a new connector, and press **Build in default agent**. OmaDigest opens the user's default coding agent with a dedicated integration-authoring skill and exact local validator commands. The agent builds in a temporary directory; the validator bounds the package, checks its manifest and syntax, runs its tests inside the connector sandbox, performs a mocked protocol probe where possible, and only then installs it atomically. A successful install remains disabled. Configuration, category selection, and enablement are separate user actions back in OmaDigest.

The bundled GitHub connector uses the active authenticated `gh` session and imports bounded unread-notification metadata. **Check status** runs its non-mutating live probe and reports the active GitHub identity without enabling it. Other applications participate through native notifications unless the user installs a separately reviewed custom connector.

**Install agent skill** links the packaged integration-authoring skill into Omarchy's shared and supported agent skill directories. This is an explicit user action rather than a plugin-install hook; handoffs retain an absolute-path fallback if the skill is not linked.

## Agent actions

Open the clock-arrow action in the main header for the **Attention timeline**. **Events** is a newest-first audit trail grouped into selectable subjects. **Memory** shows the same retained history as a time-decayed cover; open an outlined span to reveal its two child spans. On any digest entry, **Why this?** links directly to that subject timeline.

Open **Settings → Attention** to add, pause, or delete plain-language standing policies and search retained attention history. A new policy is shown as a compact preview of its current matches and priority overlaps before **Add policy** persists it. The calibration card summarizes only explicit reads, handoffs, and useful/not-useful feedback, including the bounded direction OmaDigest may use as a soft timing hint.

**Send to agent** passes the selected digest headline and explanation plus bounded source application/timestamp metadata and explicit safety framing to the default Omarchy agent. Original notification titles and bodies are omitted. The payload is claimed once from the broker rather than placed in process arguments, and all digest strings remain untrusted observations rather than instructions.

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
${XDG_CONFIG_HOME:-~/.config}/omadigest/   policy, templates, integrations, setup, enablement, research schedules
${XDG_STATE_HOME:-~/.local/state}/omadigest/ attention segments, progressive memory, research claims, and digest history
```

Provider authentication and secrets are intentionally not part of the editable configuration tree. See [configuration](configuration.md) for the complete file contract.

OmaDigest checks its latest stable GitHub release in the background no more than once per day. When a newer semantic version exists, the settings icon gains an accent dot and Settings shows a dismissible release banner. Dismissal applies only to that version, so a later release can notify again. OmaDigest never installs an update itself; **View release** opens the fixed GitHub release page and the user updates through Omarchy.

## Delete retained data

App rules and templates can be deleted inline after a compact confirmation. Removing an app rule restores the global default (or the protected-app default). Removing a custom template deletes it; removing a packaged template hides it without changing plugin files.

Open **Settings → Data** to delete digest history, OmaDigest's retained notification evidence, research watches and claim history, custom integrations, or templates, or to delete all stored OmaDigest data. Every action requires confirmation. Template deletion here also restores packaged defaults hidden inline.

Deleting notification history affects only OmaDigest state. It records an OmaDigest-owned cutoff so older notifications still present in Omarchy are not imported again; Omarchy's own notification history is never changed. Deleting integrations removes custom packages, setup, enablement, and known integration secrets while leaving bundled packages available. **Delete all** also removes standing attention policies, but does not remove model authentication or privacy rules.

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

Confirm that DND has ended and at least one policy-permitted item or enabled source result exists. Check the activity strip for a held follow-up or model connection error. Manual **+** always performs a fresh source check and requires a digest when evidence is available.

### An integration is unavailable

Open its card and check setup, permission declarations, external executable availability, and readiness. Integrations remain disabled after installation until configured and explicitly enabled.

### Inspect shell errors

```bash
qs log -p "$OMARCHY_PATH/shell" --tail 100
```
