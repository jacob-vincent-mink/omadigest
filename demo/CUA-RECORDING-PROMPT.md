# OmaDigest recording prompt

Record a concise, production-quality OmaDigest demo from this repository. Prefer the semantic demo runner over coordinate-driven computer use.

## Preflight

1. Read `AGENTS.md` and `demo/README.md`.
2. Preserve any existing worktree changes and recordings.
3. Run `npm run check`, `omarchy plugin validate "$PWD"`, and `qmllint -I /usr/share/omarchy/shell Panel.qml BarWidget.qml components/*.qml`.
4. Confirm the installed plugin contains the current QML and broker bundle.
5. Confirm workspace 9 is empty, Omarchy DND is off, and `gh auth status --hostname github.com` succeeds.

## Primary take

Run:

```bash
./demo/run-demo.sh 9
```

Do not open a terminal on the recorded workspace. The runner invokes the real notification burst internally and drives OmaDigest through narrow semantic IPC methods. It cuts only model wait time; it does not substitute mock templates, digests, or notifications.

For a human-paced take, install and use `demo/hotkeys.sh` as documented in `demo/README.md`. The hotkeys invoke the same semantic IPC and split notification/DND transitions into independently timed scenes.

The finished video must visibly show:

- built-in Omarchy sources plus the bundled GitHub connector's live authenticated status;
- native Omarchy notification popups;
- a specific, evidence-based automatic digest title;
- no Signal canary and no contentless/count-only digest entry;
- opening a digest automatically moving it from Unread to Read;
- both manual and constrained-agent editing surfaces for a packaged default template;
- the GitHub Triage template request, model-authored plan, live draft review, acceptance, and readable details; and
- a final template-routed digest with a specific PR-based title, citations, and explicit agent action.

## Quality bar

- No visible terminal, secrets, raw authentication data, or private notification content.
- No long loading stretches in the final concatenated recording.
- Keep panel transitions settled before each scene and leave enough time to read the payoff.
- Verify labels/icons are centered, both digest tabs fit their columns, and text stays within the panel.
- Retain the full output under `demo/recordings/`; do not overwrite or delete earlier takes.

Use CUA only for post-run visual inspection, screenshots, or recovery from an unexpected UI state. Do not use CUA as the normal interaction engine for the recorded take.
