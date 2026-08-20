# CUA task: record the OmaDigest hero demo

You are operating Jacob's Omarchy desktop with a computer-use/CUA tool. Record the real OmaDigest demo end to end. Do not merely describe the steps. Continue autonomously through setup, visible interaction, validation, recording shutdown, and restoration unless a safety-critical or credential-related blocker requires the user.

## Non-negotiable rules

- Repository: `/home/jacob/src/github.com/jacob-vincent-mink/omadigest`
- Installed plugin: `io.github.jacob-vincent-mink.omadigest`
- Read `demo/README.md` and every `demo/*.sh` script before starting.
- Use CUA for **every visible desktop interaction**: opening apps/panels, clicking, scrolling, typing, pasting, navigation, and closing windows.
- Shell commands are allowed for invisible preparation, checks, recording control, and restoration. If a terminal is visible in the recording, interact with it through CUA rather than injecting input into its process.
- Record on an otherwise empty Hyprland workspace 9. Do not move or expose existing user windows there.
- Use the real OmaDigest UI, scoped draft/review/accept flow, authenticated `gh`, connector sandbox, template router, notification intake, digest model, and agent handoffs. Never preinstall or manually copy the GitHub integration/template to simulate acceptance.
- Never display, print, copy, or modify provider credentials, API keys, `auth.json`, Secret Service values, or unrelated user files.
- Signal content in the synthetic burst is a privacy canary. It must not appear in persisted OmaDigest events, model input, a digest, handoff evidence, terminal output, or the video. Do not type or reveal its body yourself.
- Do not use coordinate scripts, `ydotool`, `wtype`, synthetic mouse commands, or shell-driven UI automation as a substitute for CUA.
- Do not modify source code during the take. If a product bug blocks the story, stop recording, restore state, and report the exact blocker instead of faking the result.
- Preserve the complete raw recording. Model waits may be shortened only in a later edit; do not substitute staged artifacts.
- Always stop recording and run `demo/restore.sh`, including after a failed take.

## Known-good preflight

The implementation has already passed TypeScript, Vitest, build, connector tests, `npm audit`, QML lint, plugin validation, and a real sandboxed `gh` probe as `jacob-vincent-mink`. A prior live smoke test produced:

- a GitHub Inbox integration draft containing `manifest.json`, `connector.mjs`, `connector.test.mjs`, and `README.md` with `gh` plus GitHub host permissions;
- a GitHub Triage template with Needs action, CI and releases, Reviews and mentions, and No action sections;
- a real automatic general digest after the DND burst;
- a matching `crashing-sw` systemd-coredump;
- no Signal item in the digest.

The automatic digest race found during rehearsal is fixed in commit `c1e1ef7`. The current workspace recording API is fixed in `8422ea6`.

## Phase 1: prepare without recording

1. In the repository, confirm `git status --short` is clean. Do not reset or discard anything if it is not; report the unexpected changes.
2. Confirm the installed plugin exists and `gh auth status` succeeds. Do not print tokens.
3. Run:

   ```bash
   cd /home/jacob/src/github.com/jacob-vincent-mink/omadigest
   ./demo/prepare.sh
   ```

4. Confirm `/tmp/crashing-sw` is executable, DND is off, and the script printed a backup path.
5. Confirm workspace 9 has zero windows. `demo/start-recording.sh 9` will also enforce this.
6. Start the recording:

   ```bash
   cd /home/jacob/src/github.com/jacob-vincent-mink/omadigest
   ./demo/start-recording.sh 9
   ```

7. From this point onward, keep all visible interaction on workspace 9 and use CUA.

## Phase 2: record Act 1 — focus re-entry and crash action

1. Use CUA to open OmaDigest from its bar icon. Hold briefly on the clean empty digest state, then close the panel. Opening it once activates its persistent DND trigger.
2. Use CUA to open a terminal on workspace 9 and visibly type:

   ```bash
   cd /home/jacob/src/github.com/jacob-vincent-mink/omadigest && ./demo/notification-burst.sh
   ```

3. Let the real script run. Do not reveal the script source or the privacy-canary body in the terminal. It should end with the crash exit status and automatic-generation message.
4. Close the terminal with CUA. Wait for DND to end and for OmaDigest to finish automatic generation. Do **not** press manual Generate for this first digest.
5. Open OmaDigest with CUA. Open the generated digest and dwell long enough to read its title, sections, citations, and action affordances. Confirm visually that it includes release/CI/calendar/crash context and does not contain Signal.
6. Find the `crashing-sw` digest entry and press **Send to agent**.
7. Let the explicitly launched default Omarchy agent work. Show enough of its visible result to prove that it used the `diagnose-crash` workflow and correlated the application/timestamp with systemd-coredump. The useful payoff is the deliberate null write in `crash_in_release_parser` from `demo/crashing-sw.c`; do not type this result into the agent yourself.
8. Return to OmaDigest on workspace 9 using CUA.

## Phase 3: record Act 2 — author and enable GitHub Inbox

1. Open **Settings → Integrations**.
2. Load the text of `demo/github-integration-prompt.txt` into the clipboard without displaying unrelated content, then use CUA to paste it into **Create an integration**.
3. Press **Draft integration** and wait for the real scoped agent.
4. Review the generated result visibly. Show, without rushing:
   - `manifest.json`;
   - `connector.mjs`;
   - connector tests;
   - `README.md`;
   - declared `gh` command permission;
   - bounded GitHub hosts;
   - empty read/write path permissions.
5. If the scoped result is valid, accept it through OmaDigest. Do not install it by shell.
6. If OmaDigest reports that broader follow-up is genuinely required, press **Continue in Herdr**. Show the explicit transition to a dedicated OmaDigest Herdr workspace and let the Herdr agent repair/finish the artifact. Return to OmaDigest and rely on broker hot reload. Do not invoke Herdr merely as theatre when no follow-up is needed.
7. Configure **GitHub Inbox** through its OmaDigest card:
   - repository filter: empty;
   - include read notifications: enabled.
8. Save/connect, then enable the integration. It must use the already authenticated `gh`; do not enter or expose a token.
9. Wait for connector readiness/sync and visibly show its healthy state. If it fails, do not fake data or weaken permissions; stop and report the visible error after safe cleanup.

## Phase 4: record Act 3 — author GitHub Triage and show the enriched digest

1. Open **Settings → Templates**.
2. Load `demo/github-template-prompt.txt` into the clipboard and use CUA to paste it into **Create a template**.
3. Press **Draft template** and wait for the real scoped agent.
4. Review the template visibly, including:
   - deterministic matching/routing rules;
   - GitHub Inbox source requirement;
   - sections: Needs action, CI and releases, Reviews and mentions, No action;
   - limits and readable instructions;
   - citation requirements.
5. Accept it through OmaDigest. If genuine broader work is required, use **Continue in Herdr** under the same rules as the integration.
6. Return to the main digest screen and press the normal manual generation action once.
7. Wait for completion. Open the new digest and show that deterministic routing selected **GitHub Triage** because GitHub Inbox is enabled.
8. Scroll through the cited, real authenticated GitHub result. Hold on actionable CI/review items and the No action grouping long enough for a viewer to understand the value.
9. End on a clean OmaDigest reader or main-list composition with its mark visible. Avoid opening privacy/auth/credential screens during the closing shot.

## Phase 5: stop, validate, and restore

1. Stop recording immediately after the closing shot:

   ```bash
   cd /home/jacob/src/github.com/jacob-vincent-mink/omadigest
   ./demo/stop-recording.sh
   ```

2. Find the newest file under `demo/recordings/`. Confirm it is non-empty and use `ffprobe` to report its duration, dimensions, frame rate, and codec. Do not delete or overwrite it.
3. Preserve the raw recording even if the take needs editing.
4. Restore the user's original OmaDigest state:

   ```bash
   cd /home/jacob/src/github.com/jacob-vincent-mink/omadigest
   ./demo/restore.sh
   ```

5. Confirm DND is off and no demo recording process remains.
6. Return a concise report containing:
   - absolute recording path;
   - duration and video properties;
   - whether all three acts completed;
   - whether Herdr was needed;
   - confirmation that Signal content never appeared;
   - confirmation that pre-demo state was restored;
   - any timestamps or cut suggestions for model waits/errors.

## Failure protocol

If any step fails:

1. Capture the visible error and note the recording timestamp.
2. Stop recording with `demo/stop-recording.sh`.
3. Preserve the failed take.
4. Run `demo/restore.sh`.
5. Ensure DND is off.
6. Report the exact blocker and recording path. Do not work around privacy, permissions, authentication, scoped authoring, acceptance, or CUA requirements.
