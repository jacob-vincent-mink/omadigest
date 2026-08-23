# Attention intelligence

OmaDigest keeps judgment and authority separate. A narrowly scoped attention agent may decide whether a bounded set of evidence is worth holding, digesting, or surfacing now. The broker alone decides what evidence is permitted, which source IDs and templates exist, when a follow-up may run, and how an approved typed action is executed.

## Pipeline

```text
notification / connector item
  → privacy filter
  → deterministic intent classifier
  → bounded retention
  → stable-subject evidence grouping
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

- a shared stable reference such as a PR, issue, task, repository, or CVE; or
- the same sufficiently specific title from the same application.

Generic titles such as “New message” never group by title. Group size, group count, item size, total model bytes, and retained history are all bounded. The digest validator prevents one source item from supporting conflicting entries and prevents a multi-update evidence group from being split across entries.

## Attention loop and follow-ups

The broker wakes the attention loop after a quiet notification batch, enabled-source polling, native telemetry changes, DND re-entry, a daily schedule, startup, an explicit **+** request, or a due follow-up. Focus mode suppresses autonomous reviews; it never suppresses the explicit re-entry review when focus ends.

The model can submit exactly one typed proposal. A hold schedules no model or operating-system timer itself: the broker records a bounded watch and owns the wakeup. Automatic deliberations are separated by at least 60 seconds and capped at 24 per UTC day. At most 16 watches and 64 recent decisions are retained in a 256 KiB ledger. A watch can be revisited at most three times, cannot schedule more than 24 hours ahead, and expires after 48 hours. Evidence remains pending while held and is acknowledged only after a cited digest or alert succeeds.

This makes the product adaptive without giving notification text, connectors, or the model durable execution authority. Invalid source IDs, duplicate citations, unavailable templates, oversized strings, exhausted watches, and non-digest manual proposals fail closed.

## Template suggestions

OmaDigest examines at most 200 retained items from the last seven days and compares them with a fixed catalog of safe recipes. Repeated GitHub review activity, calendar-application notifications, failures, task notifications, or direct mentions can produce a suggestion. Known count-only GitHub frequency can suggest connecting the bundled GitHub source without reading masked text.

Suggestions never auto-install policy. The user can draft one through the constrained template agent or dismiss it for 30 days. Suggestion prompts are fixed product recipes; raw notification strings are never promoted into model instructions. At most three suggestions are published and only one is shown prominently in the panel.

## Extension points

New integrations should provide narrow categories. Add category-to-intent mappings in the broker only when the meaning is stable. Add a suggestion as a fixed recipe with a minimum sample size, fixed prompt, and tests. New attention actions must be typed broker capabilities with explicit validation and budgets; content-defined tools or timers do not belong in the model session.
