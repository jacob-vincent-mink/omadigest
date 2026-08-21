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
- every static HTTPS host and validated URL setup field used as a dynamic host; command and filesystem permissions must be empty.

Secret setup fields go to Secret Service. Ordinary fields are written mode `0600` below the OmaDigest configuration root. Neither is stored in the package.

## Connector process

Connectors exchange NDJSON with the broker. The protocol is documented in [`../skills/integration-authoring/references/connector-protocol.md`](../skills/integration-authoring/references/connector-protocol.md).

The runtime supplies:

- one bounded operation plus shutdown;
- minimal environment variables;
- no ordinary home directory;
- a Bubblewrap filesystem/process boundary with no mounted home directory;
- no connector network namespace or child-process permission;
- 20-second timeout;
- 64-KiB final-response and 1-MiB total-protocol limits;
- schema validation of returned context.

Connectors request HTTPS through broker-mediated protocol messages. The broker permits only `GET`/`POST`, exact manifest/setup-derived HTTPS hosts and ports, public DNS results, selected headers, 64-KiB request bodies, 512-KiB responses, eight requests, and a 15-second per-request/20-second operation deadline. Redirects are returned but never followed automatically. External commands and host-path mounts are unsupported. Bubblewrap and Node permissions remain defense in depth, and generated parsing code plus declared remote hosts still require human review.

## Setup

Settings renders fields and source categories from the manifest. A category has stable `id`, `label`, `description`, and `defaultEnabled`; old manifests receive one implicit enabled `default` category. **Check status** runs the connector's non-mutating `probe` independently of enablement and publishes structured checking/final status; the same probe must return ready before the broker permits enablement. The existing `integration_status` and `integration_set_enabled` names remain for UI compatibility, with `integration_set_category_enabled` added for category overrides. OAuth-capable integrations can later request broker-mediated browser/device-code interactions; connectors must never launch a browser themselves.

## GitHub

The bundled GitHub connector uses the existing authenticated `gh` session. The trusted broker executes only fixed read-only `gh api user` and `gh api notifications` calls, bounds/parses their output, and supplies that data to the connector. The connector receives no token, `gh` executable, child-process permission, or network access. It imports at most 50 unread notification records within the requested time window and retains only repository name, subject, reason, type, update time, stable provenance, and a credential-free GitHub URL. Bodies, comments, diffs, repository files, and API URLs are excluded.

Its status probe calls the authenticated user endpoint and reports the active login. It starts disabled, and templates can invoke it only when they explicitly list `io.github.jacob-vincent-mink.github` in their context policy.

## Deliberately unbundled connectors

The v0.1 release ships no other external-service connector. Prototypes are not product promises:

- Google Calendar, Linear, and Todoist were not connected and synced during release validation;
- Slack requires the user to create and install a Slack app with workspace-approved scopes;
- X requires a developer account and app, and its API endpoints are pay-per-use;
- Gmail requires a complete OAuth authorization and refresh-token lifecycle;
- RSS/Atom needs a broker-level repeatable-instance contract and broader real-feed compatibility before it can honestly represent multiple subscriptions.

Native notifications from those applications can still be classified and summarized after the user explicitly enables native content globally. The integration-authoring skill remains available for reviewed local connectors, but successful mocked validation is not represented as an official live-tested integration.

Repeatable sources are a future broker contract, not duplicated package IDs. A proper implementation needs bounded instance records, per-instance setup/secrets/status/categories, deterministic routing across instances, and explicit add/remove UI.

## Omarchy-native sources

The broker also exposes local sources for application crash metadata, Omarchy update availability, charger and battery transitions, storage pressure, network transitions, failed user services, and Herdr agent completion/blocker state. These sources never read core contents, arbitrary journal bodies, network names, agent transcripts, or agent working-directory paths. Transition history is capped at 256 items and seven days, and collection begins only after its source and category are enabled.
