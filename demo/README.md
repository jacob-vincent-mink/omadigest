# OmaDigest demo production

The primary demo is a sub-minute sizzle reel: fast, repeatable, and free of terminal windows. It uses real Omarchy notifications, a live authenticated GitHub CLI connector, the real privacy policy, the scoped template agent, deterministic template routing, and the configured digest model. The finished cut runs at 0.8× speed with brief feature cards and a checksummed CC0 lo-fi track; see [`MUSIC.md`](MUSIC.md) for provenance.

## Record the polished take

Install the current plugin build, ensure workspace 9 is empty, then run:

```bash
npm run check
./demo/run-demo.sh 9
```

The runner records ten short shots, joins them, and renders the polished cut:

1. backs up and prepares isolated OmaDigest state;
2. hooks with a burst of real native notifications;
3. exits focus mode and starts a real automatic briefing;
4. opens the specifically titled digest and shows reading it moving it to Read;
5. scans the source catalog and opens the authenticated GitHub source's category controls;
6. shows an evidence-backed template suggestion, then flips a packaged template between manual and constrained-agent editing;
7. submits a GitHub Triage template request and resumes on the model-authored work plan;
8. reviews, accepts, and inspects the deterministic template;
9. routes a fresh PR #482 notification and connector evidence through it; and
10. lands on the specifically named report with citations and an agent handoff.

Model operations are not mocked. Recording stops during long model waits and private DND-only events, then resumes on meaningful UI state. The natural-language template request remains visible as drafting starts. The runner rejects a raw cut at 48 seconds or longer, then slows it to 0.8×, adds timed feature cards and CC0 music, and verifies that the polished result remains under one minute. It keeps the raw cut and scene timeline beside the final video for later editing; the polished path and duration are printed on success.

## Cut map

| Approx. time | Shot | Feature density |
| --- | --- | --- |
| 00:00–00:03 | Notification burst | Native Omarchy notifications |
| 00:03–00:05 | Focus complete | DND re-entry and automatic generation |
| 00:05–00:11 | Briefing | Specific title, evidence, Unread → Read |
| 00:11–00:18 | Sources | Broad catalog, live status, on/off, categories |
| 00:18–00:25 | Template controls | Pattern suggestion, packaged default, manual edit, agent edit |
| 00:25–00:32 | Agent work | Natural-language request and visible plan |
| 00:32–00:39 | Template result | Review, validation, install, inspect |
| 00:39–00:43 | PR routing | Real notification and deterministic template selection |
| 00:43–00:49 | Payoff | PR-specific report, citations, send to agent |

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
5. `Hyper+H` — emit the crash and additional focus events while DND is active.
6. `Hyper+R` — leave DND and trigger automatic re-entry generation.
7. `Hyper+V` — open the newest digest after it finishes; opening marks it read.

For the authoring scenes, `Hyper+T` loads the template prompt into both the clipboard and OmaDigest editor. Use `Hyper+D` to submit it, `Hyper+A` to accept it, `Hyper+J` to emit the final PR #482 update, and `Hyper+G` to generate the routed digest. `Hyper+U` and `Hyper+E` switch between Unread and Read. A phone-friendly summary of the automated reel and compact manual fallback are in [`PHONE-CUE-SHEET.md`](PHONE-CUE-SHEET.md).

Finish with `Hyper+X` to restore pre-demo state. Remove the bindings entirely with:

```bash
./demo/hotkeys.sh uninstall
```

Installation adds one marked `dofile(...)` block to `~/.config/hypr/bindings.lua`, creates a timestamped backup under `~/.local/state/omadigest-demo-hotkeys/backups/`, reloads Hyprland, and automatically rolls back if `hyprctl configerrors` reports a problem. It does not replace any existing binding.

## Privacy behavior in the take

Safe GitHub, Calendar, and Omarchy fixtures are emitted as real native notifications. Demo preparation applies explicit per-app digest rules and transient demo IPC before restarting the shell; restore clears both by restoring the user's policy and unsetting demo IPC.

Outside the isolated take, protected app names default to `ignore` and unknown app names default to `count-only`: app/time/urgency remain available for deterministic aggregate routing, title/body are erased before persistence, and individual contentless records are rejected again before model context, citation validation, and handoff evidence.

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
