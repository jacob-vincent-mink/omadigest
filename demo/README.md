# OmaDigest demo production

The primary demo is scripted so visible transitions are fast, repeatable, and free of terminal windows. It still uses real Omarchy notifications, the real privacy policy, live scoped draft agents, the connector sandbox, deterministic template routing, and the configured digest model.

## Record the polished take

Install the current plugin build, ensure workspace 9 is empty, then run:

```bash
npm run check
./demo/run-demo.sh 9
```

The runner:

1. backs up and prepares isolated OmaDigest state;
2. records real Omarchy notification popups;
3. triggers a real focus-reentry digest while omitting the model wait from the final video;
4. demonstrates opening a digest moving it from Unread to Read;
5. authors, reviews, accepts, configures, and enables a live GitHub integration;
6. authors, reviews, and accepts a deterministic GitHub Triage template;
7. generates and opens a GitHub-enriched digest; and
8. concatenates the clean scenes under `demo/recordings/` before restoring the original state.

Model and connector operations are not mocked. Recording simply stops during long model waits, then resumes on the resulting UI state. The final path is printed on success.

## Privacy behavior in the take

Safe GitHub, Calendar, and Omarchy notifications are emitted with DND off so their native Omarchy popups appear on screen. The Signal canary is emitted while DND is active and has an explicit `ignore` rule, so its content is neither displayed nor retained.

Unknown `count-only` applications retain only app/time/urgency for deterministic aggregate routing. Their title and body are erased before persistence, and individual count-only records are rejected again before model context, citation validation, and handoff evidence.

## Safety and recovery

`prepare.sh` records its backup path in `${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-backup`. `run-demo.sh` restores that backup on success and in its exit trap. If a take is interrupted after the shell itself is killed, recover with:

```bash
omarchy-shell -q notifications setDnd off
./demo/restore.sh
```

The helper never copies or changes model-provider authentication. It uses the already authenticated `gh` CLI and never displays or stores a GitHub token in connector configuration.

## Manual scene capture

For an alternate edit, use `start-recording.sh` and `stop-recording.sh` around individual semantic IPC calls:

```bash
./demo/start-recording.sh 9
omarchy-shell shell summon io.github.jacob-vincent-mink.omadigest
omarchy-shell omadigest showDigests unread
./demo/stop-recording.sh
```

CUA is reserved for visual inspection or recovery when semantic IPC reports an unexpected state; it is not the primary demo driver.
