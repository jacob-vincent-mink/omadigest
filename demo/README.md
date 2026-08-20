# OmaDigest demo production

The primary demo is scripted so visible transitions are fast, repeatable, and free of terminal windows. It uses real Omarchy notifications, a live authenticated GitHub CLI connector, the real privacy policy, the scoped template agent, deterministic template routing, and the configured digest model.

## Record the polished take

Install the current plugin build, ensure workspace 9 is empty, then run:

```bash
npm run check
./demo/run-demo.sh 9
```

The runner:

1. backs up and prepares isolated OmaDigest state;
2. shows built-in Omarchy sources and the bundled connector's live `gh` identity;
3. records real Omarchy notification popups;
4. triggers a real focus-reentry digest while omitting the model wait from the final video;
5. demonstrates opening a digest moving it from Unread to Read;
6. opens both manual and constrained-agent editors for a packaged default template;
7. authors, reviews, and accepts a deterministic GitHub Triage template with a visible model-authored plan;
8. routes fresh PR notification and real connector evidence through that template and opens the specifically named report; and
9. concatenates the clean scenes under `demo/recordings/` before restoring the original state.

Model operations are not mocked. Recording simply stops during long model waits, then resumes on the resulting UI state. The final path is printed on success.

## Record manually with demo hotkeys

Install the reversible keymap once:

```bash
./demo/hotkeys.sh install
```

The bindings use the otherwise-unused `Hyper` chord: `Super + Ctrl + Alt + Shift`. Run `./demo/hotkeys.sh list` or press `Hyper+K` for the cheat sheet. `Hyper+S` starts a fullscreen recording on workspace 9 and `Hyper+Q` stops it; clips are written to `demo/recordings/`.

A clean notification/re-entry take is:

1. `Hyper+P` — back up and prepare isolated demo state.
2. `Alt+Print` — start the normal Omarchy screen recorder.
3. `Hyper+N` — emit the visible native notification storm.
4. `Hyper+F` — enter DND/focus mode.
5. `Hyper+H` — emit the protected Signal canary, crash, and additional focus events while DND is active.
6. `Hyper+R` — leave DND and trigger automatic re-entry generation.
7. `Hyper+V` — open the newest digest after it finishes; opening marks it read.

For the authoring scenes, `Hyper+T` loads the template prompt into both the clipboard and OmaDigest editor. Use `Hyper+D` to submit it, `Hyper+A` to accept it, `Hyper+J` to emit the final PR #482 update, and `Hyper+G` to generate the routed digest. `Hyper+U` and `Hyper+E` switch between Unread and Read. A phone-friendly running order is in [`PHONE-CUE-SHEET.md`](PHONE-CUE-SHEET.md).

Finish with `Hyper+X` to restore pre-demo state. Remove the bindings entirely with:

```bash
./demo/hotkeys.sh uninstall
```

Installation adds one marked `dofile(...)` block to `~/.config/hypr/bindings.lua`, creates a timestamped backup under `~/.local/state/omadigest-demo-hotkeys/backups/`, reloads Hyprland, and automatically rolls back if `hyprctl configerrors` reports a problem. It does not replace any existing binding.

## Privacy behavior in the take

Safe GitHub, Calendar, and Omarchy notifications are emitted with DND off so their native Omarchy popups appear on screen. The Signal canary is emitted while DND is active and has an explicit `ignore` rule, so its content is neither displayed nor retained.

Unknown `count-only` applications retain only app/time/urgency for deterministic aggregate routing. Their title and body are erased before persistence, and individual count-only records are rejected again before model context, citation validation, and handoff evidence.

## Safety and recovery

`prepare.sh` records its backup path in `${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-backup`. `run-demo.sh` restores that backup on success and in its exit trap. If a take is interrupted after the shell itself is killed, recover with:

```bash
omarchy-shell -q notifications setDnd off
./demo/restore.sh
```

The helper never copies or changes model-provider authentication or integration packages. It temporarily enables the bundled GitHub connector, backs up OmaDigest's enablement record, and restores that record byte-for-byte afterward.

## Manual scene capture

For an alternate edit, use `start-recording.sh` and `stop-recording.sh` around individual semantic IPC calls:

```bash
./demo/start-recording.sh 9
omarchy-shell shell summon io.github.jacob-vincent-mink.omadigest
omarchy-shell omadigest showDigests unread
./demo/stop-recording.sh
```

CUA is reserved for visual inspection or recovery when semantic IPC reports an unexpected state; it is not the primary demo driver.
