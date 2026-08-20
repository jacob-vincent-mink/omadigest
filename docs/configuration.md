# File-backed configuration

OmaDigest keeps user-authored behavior in inspectable files under:

```text
${XDG_CONFIG_HOME:-$HOME/.config}/omadigest/
```

This is deliberate: the user's default Omarchy agent can review or edit policy, templates, integrations, and declared permissions without automating the panel. OmaDigest fingerprints this tree every two seconds and reloads valid external changes into the running UI and broker.

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
├── integration-state.json          # enabled/disabled state
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
- `count-only`: retain app/time/urgency with title and body erased;
- `digest`: permit content in digest generation but hide it from default-agent handoff;
- `digest-and-handoff`: also permit cited content after an explicit **Send to agent** click.

Signal, WhatsApp, Telegram, common password managers, and Authy have protected `ignore` defaults unless the user explicitly overrides them. Unknown applications default to `count-only`.

Policy is enforced before broker persistence. Tightening a rule rewrites retained notification segments to remove or sanitize content. Relaxing a rule affects future notifications; erased content is not recoverable.

## External edits

Use atomic file replacement where possible. Invalid templates, integration manifests, or privacy documents are rejected or skipped rather than partially activated. After a valid edit, the broker publishes updated templates, integrations, privacy policy, and attention counts to QML automatically.
