# Security and privacy

OmaDigest processes private notification, calendar, model, and speech data. Its controls reduce authority and accidental disclosure; they do not make unreviewed plugins or model output inherently trustworthy.

## Trust boundaries

- **Quickshell UI:** presentation and bounded snapshots from public Omarchy services. It does not perform network or filesystem work.
- **Broker:** trusted local authority for persistence, credentials, model sessions, connector processes, and validation. Provider credentials are written mode `0600` under `${XDG_CONFIG_HOME:-~/.config}/omadigest/auth.json`; OAuth URLs and prompts cross the QML boundary, but tokens do not.
- **Pi model provider:** receives only bounded evidence plus the public templates or selected template needed for one ephemeral attention or digest session.
- **Public research sources:** receive the user-authored query or an HTTPS request without OmaDigest credentials. Their content is untrusted evidence.
- **Integration:** separately launched, source-specific code with user authority constrained by process options and protocol.
- **TTS provider:** receives finalized read-mode text only.

## Prompt injection

Notification, connector, search-result, and public-page strings are framed as untrusted evidence. They never become system instructions or add tools. Attention sessions expose only the action variants currently permitted by broker policy and may select only a broker-eligible template; digest sessions expose only `emit_digest`; standing-policy compilation exposes only `emit_attention_policy`; drafting sessions expose one matching emitter and `out_of_scope`. Research sessions expose only three broker-owned tools: bounded search, bounded public-HTTPS read, and cited snapshot submission.

Structured output does not prove that model classification or summarization is correct. It does ensure citations refer to supplied source IDs, section shape matches the selected policy, one correlated group cannot be split or partially cited, and unsupported actions cannot execute.

## Display boundary

Notification, connector, model, template, status, and authentication strings are
untrusted data even after schema validation. Every OmaDigest QML `Text` and
`TextArea` surface explicitly uses plain-text rendering. Generated integration
labels use a plugin-local plain-text toggle instead of passing those values into
host controls whose rendering policy OmaDigest does not own. Action labels that
carry setup authority are fixed by OmaDigest rather than accepted from a
generated manifest. This prevents markup-shaped data from becoming rich text or
causing local or remote resource loads in the long-running Quickshell process.

Digest source actions are also data-free at the QML boundary: the panel sends only bounded digest, entry, source, and target identifiers. The broker looks up the saved reference, revalidates credential-free HTTPS before opening a web page, and uses one fixed Omarchy focus helper for application sources. Notification contents and connector-controlled commands are never executed. Missing retained evidence, a closed originating app, or a failed browser launch returns a visible unavailable result.

## Credentials

TTS keys and integration `secret` fields are stored through Secret Service (`secret-tool`). They are not written into `shell.json`, template files, generated packages, digest history, logs, or model prompts. A compromised process running as the same desktop user may still be able to request unlocked Secret Service items; that is outside OmaDigest's process boundary.

## Generated integrations

Generated source can be dangerous. OmaDigest therefore:

- gives inline template-authoring sessions no file/shell/network tools;
- launches integration authoring only after **Build in default agent** is clicked, with a dedicated skill that requires temporary staging and the broker-owned validator/installer;
- links that skill into supported agent directories only after **Install agent skill** is clicked and never overwrites a non-symlink skill owned by the user;
- launches a digest action in the default Omarchy agent only after **Send to agent** is clicked, framing cited notification and connector fields as untrusted evidence rather than instructions;
- derives an out-of-scope authoring handoff only from the user's original request, displays the exact broker-built prompt, and consumes a five-minute one-use confirmation token before launch;
- starts broader template follow-up in a dedicated Herdr workspace only after **Continue in Herdr** is clicked, passing the authoring request and a bounded draft snapshot while explicitly excluding credentials and unrelated files;
- accepts only allowlisted relative files and bounded sizes;
- validates the manifest and JavaScript syntax, runs package tests inside the connector sandbox, and performs a mocked default protocol probe where possible;
- installs atomically;
- keeps it disabled until setup and an explicit enable action;
- launches it outside Quickshell in Bubblewrap with a read-only system view, no home mount, a private temporary directory, minimal environment, timeout, output limit, and no direct network or child-process permission.

Connector HTTPS is broker-mediated over the bounded NDJSON protocol. The broker enforces exact declared scheme/host/port, resolves and rejects private or non-routable addresses, does not follow redirects, restricts methods and headers, and caps requests, body/response bytes, and time. External connector commands are unsupported. The bundled GitHub source uses fixed read-only broker `gh api` calls and passes only bounded response data—not a token or executable—to its connector. Human review remains mandatory because connector parsing code and declared remote hosts are still trusted after installation.

## Persistence

Notification privacy is deterministic and enforced before persistence. Protected app names default to `ignore`; unknown names default to `count-only`, which erases title and body before storage. Per-app rules match the name carried by the native notification and are user-facing content filters, not authenticated sender identity. Count-only and otherwise contentless records are rejected both when digest evidence is assembled and again at the model boundary, and they cannot become citations or action handoffs. A handoff is also refused when every cited source is missing or disallowed, which protects legacy digests generated under older policy behavior. Tightening policy retroactively rewrites retained notification segments; relaxing it cannot recover erased content.

Attention events that pass policy are schema- and item-bounded, mode `0600`,
segmented daily, retained for at most seven files, deduplicated before append,
and compacted under a 2-MiB per-segment and 8-MiB total budget. Oversized or
unreadable segments are removed rather than skipped during policy tightening.
Successful generation marks its input items seen,
and the panel also provides an explicit mark-seen action. Seen state suppresses
inbox counts but does not delete policy-permitted retained evidence, so an
explicit default-agent handoff can still resolve citations for correlation.
Connector enrichment is persisted only when normalized into the attention
store. Completed digest history is capped at the newest 30 records and supports
individual deletion and clear-all through the broker protocol.

Attention memory is a separate derived store capped at 512 episodes, 512 KiB, and 90 days. Episodes retain bounded source provenance and cover only policy-permitted evidence, broker-validated decisions, completed digests, and observable user outcomes; hidden reasoning is never stored. Temporal summary nodes are rebuilt from episodes rather than treated as canonical facts. Search/zoom results are capped at four reads and 48 KiB per attention session, remain labeled as untrusted evidence, and cannot support an action without at least one current cited source. Privacy tightening and history deletion cascade through affected episodes before summaries are rebuilt.

The attention agent cannot create a timer or execute an alert. It submits one cited `hold`, `digest`, or `notify` proposal. A hold may request only fixed wake conditions—related evidence, cited-source change, or deadline—and the broker owns subject matching, scheduling, template eligibility, interruption and digest thresholds, source-ID validation, execution, acknowledgement, and cancellation. Automatic deliberations have a 60-second minimum interval and a 24-per-day budget; watches are capped at 16, three attempts, 24 hours per follow-up, 48 hours of life, and a 256-KiB ledger.

Known chat applications receive no automatic interruption authority from urgency alone. The broker canonicalizes duplicate live/history notification IDs, groups only a specific application/title thread, waits through a fixed five-minute quiet window, and requires either the normal item threshold or an explicit user policy before digesting. Recent-digest consolidation is limited to fully retained evidence from the same conversation, one hour while unread or 15 minutes after reading, at most eight replaced records; explicit feedback and mixed-topic digests are excluded.

Standing policies do not grant new evidence or execution authority. Their compiler receives one bounded user request, has one typed output tool, and cannot access notification history. The broker caps, validates, stores, deterministically matches, enables, disables, and deletes policies. Broad notify policies fail validation. Outcome-derived preference hints come only from observable UI actions and remain soft evidence; they cannot override privacy, standing policy, urgency gates, or current-source citation requirements.

Research schedules are created by the user and run no faster than hourly. The broker permits one run at a time, at most 24 automatic runs per day, and at most 48 weighted automatic-work units (focused costs 1, broad 2, deep 4). A run may perform 4/12, 10/30, or 20/60 searches/pages, with corresponding 120k/300k/480k total source-text limits and bounded timeouts. URL parsing, redirect validation, DNS resolution, and private/non-routable address rejection occur outside the model; requests carry no cookies or credentials. Search queries must remain on-topic and carry both lower and upper date bounds; off-topic results are discarded before reading. The broker prefers an extracted publication date, then bounded news-feed metadata, and then HTTP `Last-Modified`; ordinary web-search crawl timestamps are ignored. Proposed changes outside the selected window or after the run's as-of date are discarded deterministically, while existing claims are carried forward unless current cited evidence explicitly retires them. Partial model output cannot mutate the ledger or create a digest. A cited claim or retirement must reference a relevant page successfully read in that run. The model cannot reschedule itself, contact arbitrary tools, or turn page content into execution. Watch definitions are capped at 16/128 KiB; claim history is capped at 12 runs per watch, 90 days, and 1 MiB.

The release checker has no model or connector authority. It contacts one compiled-in GitHub API URL, rejects redirects and non-stable tags, caps the response and single-record cache at 64 KiB, and constructs the browser URL from the validated release tag rather than accepting a remote action URL.

## Read mode

Read mode removes URLs, Markdown punctuation, and code blocks before synthesis. Audio is capped at 50 MiB, stored mode `0600` below the runtime directory, played through `mpv`, and deleted on exit. Remote speech is separately configured and is not implied by model-provider consent.

## Reporting

Do not include credentials, private notification bodies, secret calendar URLs, or raw model transcripts in issues. Include fixed error codes, versions, and redacted reproduction steps.
