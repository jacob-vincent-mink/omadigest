# OmaDigest demo production

This demo uses the real notification intake, privacy policy, scoped draft agents, connector sandbox, template router, digest model, default-agent action handoff, and optional Herdr continuation. Nothing is preinstalled to fake the integration/template authoring sequence.

## Safety and reset

```bash
./demo/prepare.sh
# record the demo
./demo/restore.sh
```

`prepare.sh` backs up only the OmaDigest state/configuration it changes. It does not copy or alter provider authentication. It installs a strict demo privacy policy, clears digest/attention state for the take, removes prior demo artifacts, compiles the intentionally crashing `crashing-sw` fixture with debug symbols, and records the backup path under `$XDG_RUNTIME_DIR`.

## Recording isolation

Use CUA for every visible interaction. Start on an empty Hyprland workspace; do not move existing windows into it.

```bash
./demo/start-recording.sh 9
# CUA drives the visible demo
./demo/stop-recording.sh
```

`start-recording.sh` refuses to begin if workspace 9 already contains a window.

## Act 1 — focus re-entry and action

1. CUA opens OmaDigest once, then closes it, ensuring the DND trigger is active.
2. From a demo terminal, run `./demo/notification-burst.sh`.
3. Show the notification storm while DND is active.
4. DND ends; OmaDigest automatically generates a digest.
5. Open the digest. Signal is entirely absent because its policy is `ignore`.
6. Select the `crashing-sw` entry and press **Send to agent**.
7. Show the default Omarchy agent using `diagnose-crash`, the notification timestamp, and systemd-coredump to identify the deliberate null write in `crash_in_release_parser`.

## Act 2 — author through OmaDigest

### Integration

1. Open **Settings → Integrations**.
2. Paste `demo/github-integration-prompt.txt` into **Create an integration**.
3. Press **Draft integration** and wait for the scoped result.
4. Show the review: `manifest.json`, `connector.mjs`, tests, README, `gh` command permission, and GitHub hosts.
5. Accept through OmaDigest. Do not copy files manually.
6. Configure the GitHub Inbox card with an empty repository filter and include-read enabled.
7. Enable it. The connector uses `/usr/bin/gh` with the currently authenticated account; no token is shown or stored in connector config.

If the scoped draft needs broader follow-up, press **Continue in Herdr**. This creates an explicit OmaDigest workspace and agent with the request and bounded current draft. The broker hot-reloads valid files written to the user configuration tree.

### Template

1. Open **Settings → Templates**.
2. Paste `demo/github-template-prompt.txt` into **Create a template**.
3. Press **Draft template**.
4. Open the resulting template details to show routing, sources, sections, limits, and readable instructions.
5. Accept through OmaDigest.
6. Generate a manual digest. The deterministic router selects GitHub Triage because GitHub Inbox is enabled.
7. Show real authenticated GitHub notifications grouped into Needs action, CI and releases, Reviews and mentions, and No action.

## Suggested edit

- 0–8s: notification storm.
- 8–20s: automatic digest and privacy payoff.
- 20–38s: `crashing-sw` sent to the agent and diagnosed.
- 38–62s: integration request, permission review, accept/configure.
- 62–78s: template request, readable review, accept.
- 78–95s: GitHub-enriched digest and closing mark.

Keep the full source recording. Speed up model waits and use clean cuts between acts; never substitute a prewritten artifact for the visible OmaDigest draft/accept flow.
