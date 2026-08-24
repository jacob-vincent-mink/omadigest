# Bundled integrations

Reviewed first-party integrations live in one self-contained directory per manifest ID. User-created integrations live under `${XDG_CONFIG_HOME:-~/.config}/omadigest/integrations/` and use the same contract.

```text
<integration-id>/
├── manifest.json
├── connector.mjs
├── connector.test.mjs
└── README.md
```

An integration owns no global registry entry, dependency install, or shell configuration. Removing its directory removes its code; stale enablement state is inert. Integrations are discovered disabled unless the user enables them in OmaDigest settings.

The v0.1 bundled connector catalog contains GitHub, which uses the ordinary authenticated `gh` session and has been exercised end to end. Omarchy Notifications and Focus/DND transitions remain first-party inputs; Crash Reports, Omarchy Updates, System Telemetry, and Herdr Agents are bounded broker-native sources. Every source exposes a non-mutating status probe, and templates invoke only enabled connector IDs and user-enabled categories named in their compiled context policy.

Google Calendar, Linear, Slack, Todoist, X, and RSS/Atom prototypes are intentionally not shipped as defaults. The credentialed services were not connected and synced during v0.1 release validation. RSS needs a tested repeatable-instance contract and broader real-feed compatibility before it can honestly represent multiple subscriptions. Native application notifications remain available under the user's privacy rules, and the integration-authoring skill can build separately reviewed local connectors.

See [`../skills/integration-authoring/references/connector-protocol.md`](../skills/integration-authoring/references/connector-protocol.md) and [`../docs/integrations.md`](../docs/integrations.md).

Connectors should include a credential-free HTTPS `url` for any item with a stable browser destination. OmaDigest snapshots cited destinations into the saved digest so the reader can return to the originating page later.
