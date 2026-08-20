# GitHub

This bundled connector imports bounded metadata for unread GitHub notifications through the user's existing authenticated `gh` session.

It receives broker-injected `GH_TOKEN` only inside the sandboxed connector process. OmaDigest does not persist that token. Imported evidence is limited to repository name, notification subject, reason, type, update time, and a credential-free GitHub URL; issue and pull-request bodies, comments, patches, and repository contents are excluded.

The package requests child-process access only for the broker-allowlisted `gh` executable and network access for `api.github.com` and `github.com`. It starts disabled and must pass a live readiness probe before enablement.
