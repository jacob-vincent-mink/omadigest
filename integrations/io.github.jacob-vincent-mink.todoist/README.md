# Todoist integration

Imports read-only task context through Todoist's official API v1. Copy the personal token from **Settings → Integrations → Developer** into the masked setup field. The probe requests one active task; it reports authentication failure instead of returning synthetic success.

Each sync runs three bounded requests in parallel: Todoist's `overdue | today | next 7 days` filter, its `assigned to: me` filter, and completed tasks by completion date. The completion interval is capped at 89 days to remain within Todoist's three-month endpoint limit. Results are classified as overdue, today/upcoming, assigned, or completed activity; completed activity is disabled by default.

Each response is capped at 768 KiB with an 8-second timeout. No more than 100 candidate tasks per active category, 50 completed tasks, and 50 total items are processed/emitted. Task text is bounded and treated as untrusted evidence, never instructions. Links are constructed only as credential-free `https://app.todoist.com/app/task/<id>` URLs. The API token is never included in errors, URLs, diagnostics, or model-bound content.

Official reference: [Todoist API v1 tasks, filters, completion activity, and pagination](https://developer.todoist.com/api/v1/).
