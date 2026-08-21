# GitHub

This bundled connector imports bounded metadata for unread GitHub notifications through the user's existing authenticated `gh` session.

The trusted broker makes fixed, read-only `gh api` calls and passes only bounded login/notification data into the sandbox. The connector never receives a token, executable, or network capability. Imported evidence is limited to repository name, notification subject, reason, type, update time, and a credential-free GitHub URL; issue and pull-request bodies, comments, patches, and repository contents are excluded.

The package requests no child-process or network access. It starts disabled and must pass a live broker readiness probe before enablement.
