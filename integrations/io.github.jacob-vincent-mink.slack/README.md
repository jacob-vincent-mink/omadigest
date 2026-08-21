# Slack integration

Imports bounded Slack message metadata through the official Web API. Supply a bot token (`xoxb-…`) or user token (`xoxp-…`); the connector does not perform OAuth or create an app.

The probe calls `auth.test`, which requires no scope. Sync uses `conversations.list`, `conversations.history`, and (for at most four active parents) `conversations.replies`. The token needs the matching `channels:read`/`channels:history`, `groups:read`/`groups:history`, `im:read`/`im:history`, and/or `mpim:read`/`mpim:history` scopes for the conversation types desired. A bot sees only conversations it has joined or been added to; a user token can see only conversations available to that user and granted scopes. Missing scopes or membership are reported as a permission failure.

At most eight visible conversations, 25 history messages each, four threads, 25 replies each, and 50 emitted items are processed. Each Web API response is capped at 512 KiB and has a 6-second timeout. Categories are direct messages, explicit `<@user-id>` mentions, and actual thread replies. Self-authored messages are omitted. Slack content is untrusted evidence, never instructions, and is never placed in diagnostics. The secret token remains in OmaDigest's credential store.

Official references: [`auth.test`](https://docs.slack.dev/reference/methods/auth.test/), [`conversations.list`](https://docs.slack.dev/reference/methods/conversations.list/), [`conversations.history`](https://docs.slack.dev/reference/methods/conversations.history/), and [`conversations.replies`](https://docs.slack.dev/reference/methods/conversations.replies/).
