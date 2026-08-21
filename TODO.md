# OmaDigest completion checklist

## Closed

- [x] Simplify the main screen to a digest list.
- [x] Open a focused reader when a digest is clicked.
- [x] Put Integrations, Templates, and Connections behind the settings icon.
- [x] Make the digest-generation `+` visible and unambiguous.
- [x] Make templates clickable and expose their sections, sources, matching rules, limits, and instructions.
- [x] Replace overflowing header errors with wrapped, actionable error cards.
- [x] Add in-app provider authentication for Codex/ChatGPT, OpenAI, and Grok/xAI.
- [x] Present provider authentication as a polished **Connect OmaDigest** dropdown and Connect button; keep API-key prompts in-app and OAuth callbacks in the broker.
- [x] Center the microphone toggle with the drafting button.
- [x] Replace inline voice/read-mode forms with compact selectors and a separate read-mode configuration view.
- [x] Add explicit per-entry handoff to the default Omarchy agent with retained cited evidence and crash-report correlation context.
- [x] Hide read-aloud controls until TTS is configured.
- [x] Mark successful digest inputs seen (with an explicit mark-seen action) without deleting retained correlation evidence.
- [x] Add deterministic per-application notification privacy with protected Ignore defaults, Count only, Digest, and Digest + agent modes.
- [x] Keep policy, templates, integrations, permissions, and enablement file-backed and hot-reload valid external agent edits.
- [x] Add explicit template/integration follow-up handoff to a dedicated Herdr workspace.

## In progress

- [x] Build and validate the scripted `crashing-sw` notification/coredump storyline and authenticated `gh` integration/template demo.
- [ ] Live-test every settings and template-detail navigation path.
- [ ] Complete a real OAuth sign-in and re-test digest/template/integration agents.
- [ ] Evaluate provider-linked read mode: reuse a connected OpenAI API credential only with explicit opt-in when its API project has speech access. Do not assume Codex/ChatGPT or Grok/X subscriptions include TTS API access, and do not repurpose scoped OAuth tokens.
- [ ] Design bounded repeatable connector instances with per-instance setup, secrets, status, categories, routing identity, and removal before reintroducing RSS or multi-calendar sources.

## Release validation

- [ ] Audit every panel state for centered button text/icons, vertically centered row controls, bounded text, consistent spacing, and no overlap across themes.
- [x] Live-test notification ingestion and DND-ended generation.
- [ ] Live-test scheduled generation.
- [x] Limit bundled external connectors to the end-to-end-tested GitHub integration; leave unverified service and repeatable RSS connectors unbundled.
- [ ] Live-test Voxtype dictation and its microphone placement/state changes.
- [ ] Test read mode with real provider credentials.
- [ ] Visually confirm the final quill mark across themes.
- [x] Capture a marketplace preview from the end-to-end release demo.
- [x] Finalize the dependency/license inventory.
- [x] Publish and verify the v0.1.0 release package and demo asset.
