# Attention intelligence

OmaDigest keeps judgment and authority separate. A narrowly scoped attention agent may decide whether a bounded set of evidence is worth holding, digesting, or surfacing now. The broker alone decides what evidence is permitted, which source IDs and templates exist, when a follow-up may run, and how an approved typed action is executed.

## Pipeline

```text
notification / connector item
  → privacy filter
  → deterministic intent classifier
  → cross-source entity extraction
  → bounded retention
  → stable-subject evidence grouping
  → bounded temporal memory + optional recall
  → bounded attention-agent proposal
  → broker validation
  → hold / cited digest / native alert
```

Privacy runs first. Ignored items disappear. Count-only notification items retain only application, time, and urgency; their erased text cannot influence classification, model context, citations, or handoff.

## Intent taxonomy

Every actionable item may receive one broker-owned intent:

- `failure`
- `review`
- `deadline`
- `meeting`
- `assignment`
- `mention`
- `request`
- `completion`
- `system`
- `update`

Classification uses bounded category IDs and fixed local patterns. Notification and connector strings remain untrusted evidence. Integrations can add new categories without changing the template contract; the broker maps them into the stable intent taxonomy.

Templates may match `intents`, `minimumIntentShare`, and `urgencies` in addition to triggers, applications, focus duration, item count, and connector availability. Their routing metadata remains an inspectable recommendation, while the attention agent may select among available templates when it submits a cited digest proposal. Manual requests are broker-enforced to produce a digest rather than silently holding or interrupting.

## Evidence grouping

The broker groups only high-confidence relationships:

- a shared stable entity such as a repository-qualified PR or issue, task reference, URL, or CVE across applications and sources; or
- the same sufficiently specific title from the same application.

Generic titles such as “New message” never group by title. Group size, group count, item size, total model bytes, and retained history are all bounded. The digest validator prevents one source item from supporting conflicting entries and prevents a multi-update evidence group from being split across entries.

## Progressive attention memory

Every policy-permitted evidence group can become a provenance-preserving episode. Decisions, completed digests, and observable outcomes such as reading, handoff, and watch cancellation add separate episodes. The canonical store is capped at 512 episodes, 512 KiB, and 90 days. Each episode retains its source IDs, source kinds, application names, subject, time, and a bounded summary.

The broker derives a rebuildable binary summary tree from those episodes. Its default temporal cover keeps more detail near the present and coarser summaries further in the past. Explicit recurrence language such as “again,” “still,” or “changed since” triggers one broker-owned subject lookup so precise prior provenance is present even if the model would otherwise rely on a coarse summary. The model may additionally make at most four read-only calls across `search_attention_memory`, `read_attention_thread`, and `zoom_attention_memory` before submitting its one action. A thread read accepts only one of at most 16 broker-supplied subject IDs from the current evidence. Search is bounded by fields, time, result count, and 48 KiB of returned nodes. A recalled node becomes a citable derived source, but every proposal must still cite at least one current item.

Memory results are untrusted historical evidence, never instructions. Tightening notification policy removes every episode that depends on a newly disallowed application and rebuilds the derived tree. Notification-history deletion removes notification-derived episodes; digest deletion removes its digest and outcome episodes. No hidden model reasoning is retained.

The panel projects that same canonical store as an **Attention timeline**. Deterministic entity and provenance aliases join evidence, decisions, digests, and outcomes into subject threads. Events are cursor-paged newest-first. Memory uses the same time-decayed cover as the agent and lets the user progressively open a summary span into its two child spans. Both projections have item, text, thread, and byte limits; QML receives presentation data and never reads the memory file.

This design is inspired by [OptMem](https://github.com/VictorTaelin/OptMem): particularly its append-only canonical history, rebuildable hierarchical summaries, time-decayed wake context, and zoom-based recall. OmaDigest adapts those ideas to finite retention, source provenance, privacy deletion, subject threads, and broker-owned background execution rather than embedding OptMem's implementation.

## Attention loop and follow-ups

The broker wakes the attention loop after a quiet notification batch, enabled-source polling, native telemetry changes, DND re-entry, a daily schedule, startup, an explicit **+** request, or a due follow-up. Focus mode suppresses autonomous reviews; it never suppresses the explicit re-entry review when focus ends.

The model can submit exactly one typed proposal. A hold proposes a subject, cited sources, a fallback deadline, and one or more fixed wake conditions: new evidence for the subject, a cited source changing, or the deadline arriving. The broker records that proposal as a watch lease, matches normalized subjects, and owns every event wake and timer. Hiding its main-page notice changes only bounded presentation state; the lease keeps running and can be restored or explicitly cancelled under **Settings → Behavior**. A newly scheduled follow-up surfaces the notice again. Automatic deliberations are separated by at least 60 seconds and capped at 24 per UTC day. At most 16 watches and 64 recent decisions are retained in a 256 KiB ledger. A watch can be revisited at most three times, cannot schedule more than 24 hours ahead, and expires after 48 hours. Evidence remains pending while held and is acknowledged only after a cited digest or alert succeeds.

This makes the product adaptive without giving notification text, connectors, or the model durable execution authority. Invalid source IDs, duplicate citations, unavailable templates, oversized strings, exhausted watches, and non-digest manual proposals fail closed.

## Attention rules and outcome learning

Under **Settings → Behavior**, a user can describe one persistent attention rule (stored internally as a standing policy). A scoped policy compiler has only `emit_attention_policy`; the broker validates the typed draft and produces an expiring preview before persistence. The preview shows bounded current matches and conservatively detects enabled policies whose match space overlaps with a different action; the higher priority is shown as the deterministic winner. Only explicit acceptance persists the rule. At most 32 rules fit under a 128-KiB budget. Matching is deterministic across bounded applications, sources, intents, urgencies, entity keys, and text terms. Rules can ignore, hold, digest through an installed template, or notify. Notify-rule validation requires critical, failure, deadline, or meeting evidence. Rules never broaden privacy access, model tools, source permissions, retention, or watch budgets.

Reads, explicit useful/not-useful feedback, digest-item handoffs, and watch cancellation are observable outcome episodes. The broker derives at most 12 soft preference hints for a current review and a bounded calibration summary for the user. The summary reports only outcome counts and per-thread surface/defer direction; it exposes no inferred personality or hidden reasoning. These hints may influence timing, but never override urgency, an attention rule, privacy, citation validation, or the requirement for current evidence. No latent user profile is stored.

**Why this?** is deterministic: it reports citation count, correlated subject, applications, matching attention rule, entity keys, and bounded relevant memory. Attention-history search returns at most 12 plain-text memory nodes and performs no model call.

## Timed event prep

For meeting or deadline evidence, the broker accepts only bounded relative, ISO, clock, or future-event timestamps within 24 hours. An event more than 15 minutes away can become a deadline-backed watch; the broker owns the timer and clamps the pre-event checkback. Once the event enters that window, the broker removes `hold` unless an explicit attention rule requires it. The broker owns that timing and recall behavior; the high-priority packaged **Event Prep** template only organizes current and recalled evidence into **Before it starts**, **Bring forward**, and **Can wait**. Recalled context stays historical evidence and must accompany current citations.

## Template suggestions

OmaDigest examines at most 200 retained items from the last seven days. Fixed recipes cover known useful patterns, while a deterministic app-and-intent clusterer can propose a template after at least four privacy-permitted examples across two days. Dynamic suggestions receive an outcome-oriented product name such as **Figma review queue** or **Herdr completion brief**, show bounded example titles, and construct a narrow draft request; count-only content cannot enter dynamic discovery. Known count-only GitHub frequency can still suggest connecting the bundled GitHub source without reading masked text.

Suggestions never auto-install policy. The user can inspect the examples, draft one through the constrained template agent, or dismiss it for 30 days. Choosing **Draft template** immediately acknowledges the suggestion before starting the draft, so the same prompt does not remain as an active recommendation. At most three suggestions are published and only one is shown prominently in the panel.

## Replay evaluation

`npm run eval:replay -- [fixture.json]` validates a bounded fixture and reports entity grouping, correlated-item share, interruption rate, missed critical evidence, model calls, and model calls without current evidence. Fixtures are capped at 1 MiB and 2,000 items/decisions. `npm run eval:attention` remains the isolated real-model behavioral sweep.

## Extension points

New integrations should provide narrow categories. Add category-to-intent mappings in the broker only when the meaning is stable. Add a suggestion as a fixed recipe with a minimum sample size, fixed prompt, and tests. New attention actions must be typed broker capabilities with explicit validation and budgets; content-defined tools or timers do not belong in the model session.
