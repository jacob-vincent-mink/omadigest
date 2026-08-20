# Security policy

## Supported versions

OmaDigest is currently beta. Security fixes are applied to the latest commit on `main` and included in the next tagged release.

## Reporting a vulnerability

Please do not open a public issue for a vulnerability or suspected credential/privacy exposure.

Use GitHub's **Security → Report a vulnerability** flow for this repository. Include:

- affected commit or version;
- reproduction steps and required configuration;
- expected and observed privacy or permission boundary;
- whether notification content, credentials, connector data, or local files were exposed;
- logs or screenshots with all secrets and private notification content removed.

If private vulnerability reporting is unavailable, contact the maintainer through the email on the repository owner's GitHub profile and request a private channel. Do not send secrets in the initial message.

## Security boundaries

OmaDigest enforces notification privacy before persistence or model access, scopes Pi sessions to typed submission tools, keeps generated integrations disabled until review/configuration/enablement, and runs connector processes with declared permissions and bounded execution.

Omarchy shell plugins still run inside the user's long-running Quickshell process and are not an operating-system sandbox. The connector boundary reduces integration access but does not make installed plugin code trustworthy. Review source and dependencies before installation.

Read the complete [security model](docs/security.md), including credentials, connector limitations, retention, prompt-injection handling, and explicit agent handoffs.
