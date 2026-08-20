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

See [`../skills/integration-authoring/references/connector-protocol.md`](../skills/integration-authoring/references/connector-protocol.md) and [`../docs/integrations.md`](../docs/integrations.md).
