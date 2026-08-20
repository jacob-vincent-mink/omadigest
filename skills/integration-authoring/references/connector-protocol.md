# Connector protocol v1

A connector is an executable Node.js module launched as a separate process. It reads one compact JSON object per line from stdin and writes one response per line to stdout. Diagnostics go to stderr and must not contain credentials or source bodies.

Every request and response carries the caller's `id`.

## Requests

```json
{"version":1,"type":"probe","id":"...","config":{}}
{"version":1,"type":"setup","id":"...","config":{}}
{"version":1,"type":"sync","id":"...","config":{},"cursor":null,"since":"...","until":"...","limit":50}
{"version":1,"type":"resolve","id":"...","config":{},"references":["..."]}
{"version":1,"type":"open","id":"...","reference":"..."}
{"version":1,"type":"shutdown","id":"..."}
```

The broker supplies only fields declared by the manifest. Secret values are ephemeral. Requests are bounded and may be followed by process termination on timeout or cancellation.

## Responses

```json
{"version":1,"type":"status","id":"...","state":"ready","message":"Calendar connected"}
{"version":1,"type":"setup_interaction","id":"...","interaction":{"kind":"browser","url":"https://...","message":"Continue sign-in"}}
{"version":1,"type":"setup_interaction","id":"...","interaction":{"kind":"device-code","verificationUrl":"https://...","code":"ABCD-EFGH","message":"Enter this code"}}
{"version":1,"type":"items","id":"...","items":[],"nextCursor":null}
{"version":1,"type":"open_request","id":"...","url":"https://..."}
{"version":1,"type":"error","id":"...","code":"authentication_required","message":"Reconnect this calendar"}
```

A browser URL must use HTTPS, contain no URL credentials, and match a declared network host. `open_request` asks the broker/UI to open a reviewed source URL; the connector does not invoke a browser.

## Normalized context item

```json
{
  "id": "google-calendar:event:opaque-id",
  "connector": "local.google-calendar",
  "kind": "calendar-event",
  "occurredAt": "2026-08-20T10:00:00.000Z",
  "title": "Design review",
  "body": "Optional bounded source detail",
  "url": "https://calendar.google.com/...",
  "sensitivity": "work",
  "derivedFrom": ["calendar:event:opaque-id"]
}
```

Maximum defaults: 50 items, 64 KiB total JSON, 12 KiB per text field, and 15 seconds per operation. The broker may enforce stricter template limits.
