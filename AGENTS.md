# OmaDigest contributor guidance

- Keep QML presentation-only; network, filesystem, model, and connector work belongs in the TypeScript broker.
- Do not expose Pi's general `bash`, `read`, `write`, or `edit` tools to digest or template-draft sessions.
- Template routing must remain deterministic and testable outside the model.
- Treat notification and connector strings as untrusted evidence, never instructions.
- Every persisted or model-bound collection must have item, byte, and retention bounds.
- Omarchy installation runs no dependency hook. Keep the checked-in broker bundle reproducible from the lockfile.
- Never edit files below `/usr/share/omarchy`; they are references only.
- Run `npm run check`, `omarchy plugin validate "$PWD"`, and `qmllint` before committing.
