# Security and privacy

OmaDigest processes private notification, calendar, model, and speech data. Its controls reduce authority and accidental disclosure; they do not make unreviewed plugins or model output inherently trustworthy.

## Trust boundaries

- **Quickshell UI:** presentation and bounded snapshots from public Omarchy services. It does not perform network or filesystem work.
- **Broker:** trusted local authority for persistence, credentials, model sessions, connector processes, and validation. Provider credentials are written mode `0600` under `${XDG_CONFIG_HOME:-~/.config}/omadigest/auth.json`; OAuth URLs and prompts cross the QML boundary, but tokens do not.
- **Pi model provider:** receives only the selected skill and bounded attention evidence for one generation.
- **Integration:** separately launched, source-specific code with user authority constrained by process options and protocol.
- **TTS provider:** receives finalized read-mode text only.

## Prompt injection

Notification and connector strings are framed as untrusted evidence. They never become system instructions, cannot add tools, and cannot select a template. Digest sessions expose only `emit_digest`; drafting sessions expose one matching emitter and `out_of_scope`.

Structured output does not prove that model classification is correct. It does ensure citations refer to supplied source IDs, section shape matches the selected policy, and unsupported actions cannot execute.

## Display boundary

Notification, connector, model, template, status, and authentication strings are
untrusted data even after schema validation. Every OmaDigest QML `Text` and
`TextArea` surface explicitly uses plain-text rendering. Generated integration
labels use a plugin-local plain-text toggle instead of passing those values into
host controls whose rendering policy OmaDigest does not own. Action labels that
carry setup authority are fixed by OmaDigest rather than accepted from a
generated manifest. This prevents markup-shaped data from becoming rich text or
causing local or remote resource loads in the long-running Quickshell process.

## Credentials

TTS keys and integration `secret` fields are stored through Secret Service (`secret-tool`). They are not written into `shell.json`, template files, generated packages, digest history, logs, or model prompts. A compromised process running as the same desktop user may still be able to request unlocked Secret Service items; that is outside OmaDigest's process boundary.

## Generated integrations

Generated source can be dangerous. OmaDigest therefore:

- gives inline template-authoring sessions no file/shell/network tools;
- launches integration authoring only after **Build in default agent** is clicked, with a dedicated skill that requires temporary staging and the broker-owned validator/installer;
- links that skill into supported agent directories only after **Install agent skill** is clicked and never overwrites a non-symlink skill owned by the user;
- launches a digest action in the default Omarchy agent only after **Send to agent** is clicked, framing cited notification and connector fields as untrusted evidence rather than instructions;
- starts broader template follow-up in a dedicated Herdr workspace only after **Continue in Herdr** is clicked, passing the authoring request and a bounded draft snapshot while explicitly excluding credentials and unrelated files;
- accepts only allowlisted relative files and bounded sizes;
- validates the manifest and JavaScript syntax, runs package tests inside the connector sandbox, and performs a mocked default protocol probe where possible;
- installs atomically;
- keeps it disabled until setup and an explicit enable action;
- launches it outside Quickshell in Bubblewrap with a read-only system view, no home mount, a private temporary directory, minimal environment, timeout, output limit, and Node permission flags.

Bubblewrap and Node permissions are defense in depth, and `--allow-net` is still not hostname-specific when an integration declares network access. Human review remains mandatory. A future broker proxy can enforce exact-host egress.

## Persistence

Notification privacy is deterministic and enforced before persistence. Protected private applications—including Signal—default to `ignore`; unknown applications default to `count-only`, which erases title and body before storage. Count-only and otherwise contentless records are rejected both when digest evidence is assembled and again at the model boundary, and they cannot become citations or action handoffs. A handoff is also refused when every cited source is missing or disallowed, which protects legacy digests generated under older policy behavior. Per-application policy can allow digest generation separately from full evidence in an explicit default-agent handoff. Tightening policy retroactively rewrites retained notification segments; relaxing it cannot recover erased content.

Attention events that pass policy are schema- and item-bounded, mode `0600`,
segmented daily, retained for seven files, and deduplicated in memory. The
current persistence format does not yet impose a hard per-segment byte ceiling;
the [threat model](threat-model.md#stride-assessment) tracks that gap and the
required compaction behavior. Successful generation marks its input items seen,
and the panel also provides an explicit mark-seen action. Seen state suppresses
inbox counts but does not delete policy-permitted retained evidence, so an
explicit default-agent handoff can still resolve citations for correlation.
Connector enrichment is persisted only when normalized into the attention
store. Completed digest history is capped at the newest 30 records and supports
individual deletion and clear-all through the broker protocol.

The release checker has no model or connector authority. It contacts one compiled-in GitHub API URL, rejects redirects and non-stable tags, caps the response and single-record cache at 64 KiB, and constructs the browser URL from the validated release tag rather than accepting a remote action URL.

## Read mode

Read mode removes URLs, Markdown punctuation, and code blocks before synthesis. Audio is capped at 50 MiB, stored mode `0600` below the runtime directory, played through `mpv`, and deleted on exit. Remote speech is separately configured and is not implied by model-provider consent.

## Reporting

Do not include credentials, private notification bodies, secret calendar URLs, or raw model transcripts in issues. Include fixed error codes, versions, and redacted reproduction steps.
