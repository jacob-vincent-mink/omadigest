# Template contract

A proposal contains a lowercase `id`, display metadata, `skillMarkdown`, and a compiled policy matching `runtime/src/template-schema.ts`.

The compiled policy has:

- `priority`: `0..100`; specialized templates normally use `50..90`, while the general fallback uses `10`.
- `match.triggers`: any of `manual`, `dnd-ended`, or `scheduled`.
- optional `minimumItems` and `minimumFocusMinutes`.
- optional `applications` plus `minimumApplicationShare` from `0..1`.
- optional `requiresConnectors`; all must already be enabled and ready.
- `context.connectors`, optional `connectorCategories` (a connector-ID to category-ID list map), `maximumItems`, and `maximumBytes`. Requested categories are deterministically intersected with the user's enabled categories; templates cannot enable categories.
- `output.sections` and `maximumEntries`.

Every declared match condition must pass. Matching templates are ranked by priority, then number of explicit conditions, then stable ID. A user's generation-time override wins over routing.

`skillMarkdown` follows the Agent Skills format with `name` and `description` frontmatter. Its body should define the briefing goal, classification rules, citation requirements, uncertainty behavior, and style. It must not contain executable setup instructions.
