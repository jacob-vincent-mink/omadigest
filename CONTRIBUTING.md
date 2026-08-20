# Contributing to OmaDigest

Thanks for helping improve OmaDigest.

## Before opening a change

- Use a GitHub issue for feature proposals and non-sensitive bugs.
- Use [private vulnerability reporting](SECURITY.md) for security, privacy, or credential issues.
- Keep the Quickshell layer presentation-only; policy, persistence, model access, and connector execution belong in the broker.
- Do not weaken privacy defaults, scoped-agent tool limits, explicit acceptance, connector permissions, or handoff confirmation.

## Development setup

```bash
git clone git@github.com:jacob-vincent-mink/omadigest.git
cd omadigest
npm ci
npm run check
node --test integrations/*/connector.test.mjs
npm audit
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml components/*.qml
```

`npm run check` regenerates the checked-in broker bundle and source map. Include legitimate generated changes in the same commit as their source.

The Omarchy validator rejects symlinks, including those in `node_modules/.bin`. Run it from a clean checkout or temporarily move `node_modules` outside the plugin root:

```bash
omarchy plugin validate "$PWD"
```

See the complete [development guide](docs/development.md) and repository rules in [AGENTS.md](AGENTS.md).

## Pull requests

A focused pull request should include:

- the user problem and chosen boundary;
- tests for deterministic broker behavior;
- updated user/security documentation when behavior changes;
- QML lint and visual checks for UI changes;
- no credentials, private notifications, local config, or generated demo recordings.

For visual changes, test multiple contrasting Omarchy themes and include tightly cropped screenshots containing no unrelated desktop content.
