# Templates

Templates define what a digest is for, when it applies, which context it may use, and how its output is organized.

## User experience

The intended workflow is conversational:

1. Choose **Template** under **Draft with the agent**.
2. Type or dictate a goal such as “After an hour of focus, tell me what actually needs a response and put routine updates last.”
3. OmaDigest runs a tool-restricted drafting session.
4. Review the readable skill and compiled policy.
5. Accept or discard the complete proposal.
6. At generation time, inspect the selected template and its match reasons or choose another.

Voice input never submits automatically.

## Files

`SKILL.md` is the user-owned synthesis policy. It should explain classification, citation, uncertainty, and style. It must not contain executable setup instructions.

The Quickshell manual editor exposes `template.compiled.json` for deliberate edits alongside the readable instructions. Every save is parsed and validated by the TypeScript broker before atomic installation. It contains bounded fields validated by `runtime/src/template-schema.ts`:

- priority;
- trigger (`manual`, `dnd-ended`, or `scheduled`);
- minimum item/focus thresholds;
- source-application share;
- required enabled connectors;
- context item/byte budgets;
- exact output sections and entry limit.

## Selection

All declared match conditions must pass. Matching templates rank by:

1. priority;
2. number of explicit conditions;
3. stable ID.

A generation-time user override wins. The model never selects the governing template.

## Storage

Bundled templates live in the plugin repository. Accepted user templates live under:

```text
${XDG_CONFIG_HOME:-~/.config}/omadigest/templates/<id>/
```

A user template with the same ID replaces the bundled template without modifying packaged files. Acceptance uses a sibling staging directory and atomic rename with rollback backup.

This overlay rule also makes reset deterministic: deleting custom templates removes every user-created template and every edited bundled overlay, revealing the unchanged packaged defaults again.

## Drafting guardrails

The drafting session can call only progress/clarification controls, `emit_template_draft`, or `out_of_scope`. For a revision, the broker supplies the current bounded template and rejects an emitted replacement whose ID changes. The host validates the proposal before it reaches the review surface. It cannot enable integrations, access notification content, change model credentials, execute commands, or install itself.
