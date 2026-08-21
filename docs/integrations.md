# Integrations

Notifications are routing signals, not complete context. Integrations resolve narrowly scoped source information for one digest.

## Package lifecycle

A generated package moves through explicit states:

```text
OmaDigest request → default agent + authoring skill → temporary package
                  → schema/syntax/sandbox-test/probe validation
                  → atomic disabled install → setup → enabled
```

The default agent works outside the live integration directory. The standalone `omadigest-author` command rejects symlinks, unsafe paths, oversized or incomplete packages, invalid manifests, syntax failures, failing sandboxed tests, and invalid protocol output. Installation happens only after all gates pass. Installation does not enable the integration. Setup does not enable it either.

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
- every static network host, validated URL setup field used as a dynamic host, external command, read path, and write path.

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

Bubblewrap and Node's permission model are defense in depth, not a complete malicious-code proof. Network permission is currently process-wide once declared; the runtime independently reviews URLs and connector schemas but cannot enforce a hostname-only kernel policy. A connector with a user-configured public HTTPS endpoint declares the corresponding URL field in `networkSetupFields` and must reject credentials, redirects, and private or local addresses before fetching. Generated code therefore still requires human review. `gh` is the only supported external command and receives broker-controlled authentication; declared host-path mounts remain unsupported.

## Setup

Settings renders fields and source categories from the manifest. A category has stable `id`, `label`, `description`, and `defaultEnabled`; old manifests receive one implicit enabled `default` category. **Check status** runs the connector's non-mutating `probe` independently of enablement and publishes structured checking/final status; the same probe must return ready before the broker permits enablement. The existing `integration_status` and `integration_set_enabled` names remain for UI compatibility, with `integration_set_category_enabled` added for category overrides. OAuth-capable integrations can later request broker-mediated browser/device-code interactions; connectors must never launch a browser themselves.

## GitHub

The bundled GitHub connector uses the existing authenticated `gh` session. The broker retrieves the token only to inject it into the sandboxed process; it never persists or sends the token to a model. The connector imports at most 50 unread notification records within the requested time window and retains only repository name, subject, reason, type, update time, stable provenance, and a credential-free GitHub URL. Bodies, comments, diffs, repository files, and API URLs are excluded.

Its status probe calls the authenticated user endpoint and reports the active login. It starts disabled, and templates can invoke it only when they explicitly list `io.github.jacob-vincent-mink.github` in their context policy.

## Google Calendar

The bundled connector deliberately starts with Google's private iCal feed rather than a shipped OAuth client:

- the user pastes the Secret address from Google Calendar settings;
- Secret Service stores it;
- only the connector receives it;
- the connector fetches from `calendar.google.com`;
- emitted context contains event ID, title, start/end, safe URL, and provenance;
- descriptions, attendees, attachments, and the feed URL are excluded.

This offers direct in-panel setup without pretending that OAuth is simple or embedding a shared client secret.

## Bundled source catalog

- **X** uses an app-only bearer token for public mentions and selected public-account activity. It does not claim private-account or user-OAuth access.
- **Linear** covers assigned issues, mentions/comments, workflow changes, and due work through a personal API key.
- **Slack** covers visible direct messages, mentions, and thread replies, bounded by the supplied token's scopes and memberships.
- **Todoist** covers overdue, upcoming, assigned, and optionally completed task activity through a personal API token.
- **RSS and Atom** reads one public credential-free HTTPS feed, with separate new-entry and priority-keyword categories and private-network protections.

Gmail is intentionally not bundled yet. A durable implementation needs a complete OAuth authorization and refresh-token lifecycle; the current connector setup contract cannot bootstrap that honestly without shipping and operating a Google OAuth client.

## Omarchy-native sources

The broker also exposes local sources for application crash metadata, Omarchy update availability, charger and battery transitions, storage pressure, network transitions, failed user services, and Herdr agent completion/blocker state. These sources never read core contents, arbitrary journal bodies, network names, agent transcripts, or agent working-directory paths. Transition history is capped at 256 items and seven days, and collection begins only after its source and category are enabled.
