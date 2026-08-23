# File-backed configuration

OmaDigest keeps user-authored behavior in inspectable files under:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/omadigest/
```

This is deliberate: the user's default Omarchy agent can review or edit policy, templates, integrations, and declared permissions without automating the panel. OmaDigest fingerprints this tree every two seconds and reloads valid external changes into the running UI and broker.

Bounded runtime state lives separately under `${XDG_STATE_HOME:-$HOME/.local/state}/omadigest/`. That directory includes attention segments, seen IDs, digest history, the bounded attention-loop watch/decision ledger, a 512-KiB/512-episode/90-day progressive attention memory, dismissed template suggestions, and one release-update cache record. It is product state, not an agent-editable control plane.

## Layout

```text
omadigest/
├── privacy.json                    # notification intake/model/handoff policy
├── attention-policies.json         # up to 32 typed standing attention policies
├── templates/<id>/
│   ├── SKILL.md                    # readable generation instructions
│   └── template.compiled.json      # eligibility and output policy
├── template-state.json             # bounded hidden packaged-template IDs
├── integrations/<id>/
│   ├── manifest.json               # setup, capabilities, and permissions
│   ├── connector.mjs
│   ├── connector.test.mjs
│   └── README.md
├── integration-state.json          # bounded source and category enablement
├── native-source-state.json        # bounded local transition snapshots/events
├── integration-config/<id>.json    # non-secret connector setup
├── speech.json                     # TTS provider settings, never the key
├── agent.json                      # selected generation provider
├── auth.json                       # private provider credentials
└── models-store.json               # Pi model catalog cache
```

Integration secrets and TTS keys intentionally remain in Secret Service rather than files. Agents should not read or rewrite `auth.json`; account changes belong to the typed **Connect OmaDigest** flow.

## Privacy policy

`privacy.json` is a versioned document:

```json
{
  "version": 1,
  "defaultMode": "count-only",
  "applications": {
    "signal": "ignore",
    "github": "digest-and-handoff"
  }
}
```

Modes are:

- `ignore`: do not retain or count the notification;
- `count-only`: retain app/time/urgency with title and body erased; these records may contribute only to local frequency-based template suggestions and are excluded from attention decisions, digest evidence, citations, alerts, and handoffs;
- `digest`: permit content in digest generation but hide it from default-agent handoff;
- `digest-and-handoff`: also permit cited content after an explicit **Send to agent** click.

Signal, WhatsApp, Telegram, common password managers, and Authy have protected `ignore` defaults unless the user explicitly overrides them. Unknown applications default to `count-only`. Rules match the application name carried by the native notification; they are content filters, not authenticated application identities.

Policy is enforced before broker persistence. Tightening a rule rewrites retained notification segments to remove or sanitize content. Relaxing it affects future notifications; erased content is not recoverable.

Standing attention policies are compiled only from an explicit request under **Settings → Attention**, then validated and matched by the broker. They may narrow timing or choose ignore, hold, digest, or notify for matching permitted evidence; they cannot broaden privacy or connector access.

## External edits

Use atomic file replacement where possible. Invalid templates, integration manifests, or privacy documents are rejected or skipped rather than partially activated. After a valid edit, the broker publishes updated templates, integrations, privacy policy, and attention counts to QML automatically.
