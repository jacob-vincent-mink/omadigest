# RSS and Atom integration

Imports one public, credential-free HTTPS RSS or Atom feed with no parser dependency. The parser is deterministic: it rejects DTD/custom-entity declarations, decodes only XML's predefined and bounded numeric entities, inspects at most 500 entries, and requires a valid published/updated date. HTML-like markup is reduced to bounded text. Feed content is untrusted evidence, never instructions.

The connector rejects URL credentials, non-HTTPS URLs, explicit ports, local/private hostnames and addresses, DNS results containing private addresses, and cross-origin redirects. It follows at most two same-origin redirects. The feed body is streamed with a hard 2 MiB cap and a 10-second request timeout. At most 50 items are emitted. Stable IDs are SHA-256 digests of the entry ID, canonical link, or deterministic title/date fallback. Entry links must also be safe HTTPS URLs and never inherit the feed's credentials.

Optional comma-separated priority keywords are normalized to at most 10 values of 40 characters. Matching is deterministic and case-insensitive; matching entries can appear in both `new-entries` and `priority-keywords`.

## Dynamic-host contract limitation

The current connector ABI unlocks network access when `permissions.networkHosts` is non-empty but cannot express a host derived from a URL setup field. The reserved `user-configured-feed.invalid` entry is an explicit disclosure placeholder, not a contacted host. This package must not pass full authoring/release validation until the shared source contract represents and reviews the configured feed host. Package-local parsing and safety tests remain valid in the meantime.
