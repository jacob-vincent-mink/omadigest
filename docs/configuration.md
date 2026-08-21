# File-backed configuration

OmaDigest keeps user-authored behavior in inspectable files under:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/omadigest/
```

This is deliberate: the user's default Omarchy agent can review or edit policy, templates, integrations, and declared permissions without automating the panel. OmaDigest fingerprints this tree every two seconds and reloads valid external changes into the running UI and broker.

Bounded runtime state lives separately under `${XDG_STATE_HOME:-$HOME/.local/state}/omadigest/`. That directory includes attention segments, seen IDs, digest history, dismissed template suggestions, and one release-update cache record. It is product state, not an agent-editable control plane.

## Layout

```text
omadigest/
├── privacy.json                    # notification intake/model/handoff policy
├── templates/<id>/
│   ├── SKILL.md                    # readable generation instructions
│   └── template.compiled.json      # deterministic routing and output policy
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
  "version": 2,
  "nativeMode": "count-only"
}
```

Modes are:

- `ignore`: do not retain or count the notification;
- `count-only`: retain app/time/urgency with title and body erased; aggregate application counts may influence deterministic template routing, but individual records are excluded from digest evidence, citations, and handoffs;
- `digest`: permit content in digest generation but hide it from default-agent handoff;
- `digest-and-handoff`: also permit cited content after an explicit **Send to agent** click.

Native notification application labels are supplied by the sender and cannot authenticate an application. App-label rules therefore cannot grant content authority. One global native-notification mode defaults to `count-only`; changing it to `digest` or `digest-and-handoff` is explicit consent for all native notifications. Version-1 per-app policy files migrate conservatively to `ignore` or `count-only`, never to a broader content mode.

Policy is enforced before broker persistence. Tightening the global mode rewrites retained notification segments to remove or sanitize content. Relaxing it affects future notifications; erased content is not recoverable.

## External edits

Use atomic file replacement where possible. Invalid templates, integration manifests, or privacy documents are rejected or skipped rather than partially activated. After a valid edit, the broker publishes updated templates, integrations, privacy policy, and attention counts to QML automatically.
