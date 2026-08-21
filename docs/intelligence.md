# Attention intelligence

OmaDigest keeps “smart” behavior split between deterministic broker policy and a narrowly scoped model. The broker decides what is safe, related, eligible, and routable. The model only names and summarizes the resulting bounded evidence.

## Pipeline

```text
notification / connector item
  → privacy filter
  → deterministic intent classifier
  → bounded retention
  → automatic-trigger decision
  → deterministic template selector
  → stable-subject evidence grouping
  → bounded model context
  → cited digest validation
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

Templates may match `intents`, `minimumIntentShare`, and `urgencies` in addition to triggers, applications, focus duration, item count, and connector availability. Selection remains deterministic and testable without a model.

## Evidence grouping

The broker groups only high-confidence relationships:

- a shared stable reference such as a PR, issue, task, repository, or CVE; or
- the same sufficiently specific title from the same application.

Generic titles such as “New message” never group by title. Group size, group count, item size, total model bytes, and retained history are all bounded. The digest validator prevents one source item from supporting conflicting entries and prevents a multi-update evidence group from being split across entries.

## Automatic triggers

Manual generation always remains explicit. Scheduled generation checks for new evidence. Focus re-entry generates when one of these is true:

- critical actionable attention arrived;
- the configured item threshold is met and at least one item has a high-signal intent; or
- a meaningful focus session has at least one high-signal item.

A brief DND toggle with only low-signal updates is skipped with a normal status message, not treated as an error. Skipped items remain available for a later manual or scheduled digest.

## Template suggestions

OmaDigest examines at most 200 retained items from the last seven days and compares them with a fixed catalog of safe recipes. Repeated GitHub review activity, calendar churn, failures, task commitments, or direct mentions can produce a suggestion. Known count-only GitHub frequency can suggest connecting the bundled GitHub source without reading masked text.

Suggestions never auto-install policy. The user can draft one through the constrained template agent or dismiss it for 30 days. Suggestion prompts are fixed product recipes; raw notification strings are never promoted into model instructions. At most three suggestions are published and only one is shown prominently in the panel.

## Extension points

New integrations should provide narrow categories. Add category-to-intent mappings in the broker only when the meaning is stable. Add a suggestion as a fixed recipe with a minimum sample size, fixed prompt, and tests. Avoid app-specific model prompts, free-form trigger rules, or content-defined actions.
