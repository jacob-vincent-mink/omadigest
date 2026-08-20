# Integrations

Notifications are routing signals, not complete context. Integrations resolve narrowly scoped source information for one digest.

## Package lifecycle

A generated package moves through explicit states:

```text
agent proposal → in-memory draft → schema validation → syntax check
              → complete diff review → accepted directory → setup → enabled
```

Drafting never writes to the live integration directory. Acceptance does not enable the integration. Setup does not enable it either.

User packages live at:

```text
${XDG_CONFIG_HOME:-~/.config}/omadigest/integrations/<id>/
```

Removing that directory removes the executable code wholesale. The separate enablement/config records become inert because discovery requires a valid package and entry point.

## Manifest

The manifest declares:

- identity, version, author, and description;
- one `.mjs` entry point;
- `sync`, `resolve`, and/or `open` capabilities;
- setup fields rendered by OmaDigest settings;
- every network host, external command, read path, and write path.

Secret setup fields go to Secret Service. Ordinary fields are written mode `0600` below the OmaDigest configuration root. Neither is stored in the package.

## Connector process

Connectors exchange NDJSON with the broker. The protocol is documented in [`../skills/integration-authoring/references/connector-protocol.md`](../skills/integration-authoring/references/connector-protocol.md).

The runtime supplies:

- one bounded operation plus shutdown;
- minimal environment variables;
- no ordinary home directory;
- a Bubblewrap filesystem/process boundary with no mounted home directory;
- Node permission flags derived from the manifest;
- 20-second timeout;
- 128 KiB output limit;
- schema validation of returned context.

Bubblewrap and Node's permission model are defense in depth, not a complete malicious-code proof. Network permission is currently process-wide once declared; the runtime independently reviews URLs and connector schemas but cannot enforce a hostname-only kernel policy. Generated code therefore still requires human review. External-CLI integrations and declared host-path mounts are intentionally unsupported in the current runtime.

## Setup

Settings renders fields from the manifest. A connector `probe` must return ready before the broker permits enablement. OAuth-capable integrations can later request broker-mediated browser/device-code interactions; connectors must never launch a browser themselves.

## Google Calendar

The bundled connector deliberately starts with Google's private iCal feed rather than a shipped OAuth client:

- the user pastes the Secret address from Google Calendar settings;
- Secret Service stores it;
- only the connector receives it;
- the connector fetches from `calendar.google.com`;
- emitted context contains event ID, title, start/end, safe URL, and provenance;
- descriptions, attendees, attachments, and the feed URL are excluded.

This offers direct in-panel setup without pretending that OAuth is simple or embedding a shared client secret.
