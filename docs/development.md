# Development

## Repository layout

```text
BarWidget.qml, Panel.qml     Omarchy entry point and panel
components/                  theme-native QML components and broker store
runtime/src/                 TypeScript broker and policies
runtime/test/                deterministic unit tests
templates/                   bundled digest skills
integrations/                bundled removable connectors
skills/                      scoped Pi instructions and default-agent authoring skill
docs/                        usage, product, and security contracts
assets/                      monochrome runtime and README marks
.github/workflows/           repository CI
```

## Build and test

```bash
npm ci
sudo apt-get install bubblewrap # non-Omarchy Linux development hosts only
npm run check
npm run eval:replay
npm run eval:attention
npm audit
node --test integrations/*/connector.test.mjs
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml components/*.qml
```

`npm run check` type-checks, runs Vitest, and creates the minified
`runtime/dist/omadigest-broker.mjs` entry point plus its checked-in
`runtime/dist/chunks/` modules. Code splitting keeps each executable text file
within the marketplace scanner's per-file bound. The bundle includes a
`createRequire` bridge because some pinned Pi dependencies still use CommonJS
dynamic imports.

OmaDigest builds against a deliberately scoped Pi surface: the low-level Agent,
the structured tools supplied by OmaDigest, and the OpenAI/Codex and xAI model
providers shown in settings. It does not bundle Pi's terminal UI or general
filesystem and shell tools.

`npm run eval:replay -- [fixture.json]` performs a deterministic, bounded
attention-policy replay and reports grouping, interruption, critical-miss, and
model-call metrics. `npm run eval:attention` starts isolated brokers with the
configured real model and exercises PR correlation, a JIT context pack,
low-signal holding, historical recall, and standing-policy compilation. It
does not read or write the installed plugin's state.

The two tests that execute Bubblewrap require network-namespace support. They
run during local release validation on Omarchy. GitHub-hosted runners block that
kernel operation, so CI sets `OMADIGEST_SKIP_SANDBOX_TESTS=1` and reports those
two cases as skipped; it still runs the syntax-rejection path and every other
test.

## Validate as an Omarchy plugin

The Omarchy validator rejects symlinks anywhere in the folder, including npm's `node_modules/.bin`. Validate a clean checkout or temporarily keep `node_modules` outside the plugin root:

```bash
omarchy plugin validate "$PWD"
```

Never edit `/usr/share/omarchy`; use it only as the canonical host-contract reference.

## Marketplace repository contract

The public repository follows the [Omarchy Plugins development guide](https://omarchyplugins.com/develop.html):

- permanent namespaced ID and root `manifest.json`;
- one `bar-widget` kind whose `BarWidget.qml` loads its nested panel;
- matching `moduleName` in the bar and panel;
- root README, MIT license, safe install/update/removal instructions, and documented retained data;
- checked-in entry points and runtime bundle with no symlinks;
- external runtime and optional dependencies documented;
- local `omarchy plugin validate` and `qmllint` commands documented;
- public CI for the portable TypeScript, test, audit, bundle, and manifest checks.

The root `preview.png` is a frame from the end-to-end release demo. It shows the themed OmaDigest panel and contains no unrelated windows.

## Broker smoke test

```bash
printf '%s\n' \
  '{"type":"initialize","protocolVersion":2}' \
  '{"type":"dictation_status","id":"voice"}' \
  '{"type":"tts_status","id":"speech"}' \
  '{"type":"shutdown"}' \
  | runtime/dist/omadigest-broker.mjs
```

Stdout is protocol-only. Bounded diagnostics go to stderr.

## Release requirements

Before publishing:

- clean install from a plain git clone;
- no install hook, sudo, package-manager action, or runtime npm download;
- checked-in reproducible broker entry point, chunks, and source maps;
- lockfile-derived dependency/license inventory;
- manifest validation and QML lint;
- live notification, Pi auth, dictation, Secret Service, connector, and TTS smoke tests;
- screenshots in at least three contrasting Omarchy themes;
- verified remove/reinstall behavior and documented retained user data.
