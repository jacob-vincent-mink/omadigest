#!/usr/bin/env bash
set -euo pipefail

config_root="${XDG_CONFIG_HOME:-$HOME/.config}/omadigest"
state_root="${XDG_STATE_HOME:-$HOME/.local/state}/omadigest"
backup_root="${XDG_STATE_HOME:-$HOME/.local/state}/omadigest-demo-backups/$(date +%Y%m%d-%H%M%S)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
demo_integration="io.github.jacob-vincent-mink.github-inbox"
demo_template="github-triage"

MISE_QUIET=1 /usr/bin/gh auth status >/dev/null
mkdir -p "$backup_root/config" "$backup_root/state"
chmod 700 "$backup_root" "$backup_root/config" "$backup_root/state"

if [[ -d "$state_root" ]]; then cp -a "$state_root/." "$backup_root/state/"; fi
for path in privacy.json integration-state.json; do
  if [[ -f "$config_root/$path" ]]; then cp -a "$config_root/$path" "$backup_root/config/$path"; fi
done
for path in "templates/$demo_template" "integrations/$demo_integration" "integration-config/$demo_integration.json"; do
  if [[ -e "$config_root/$path" ]]; then
    mkdir -p "$backup_root/config/$(dirname "$path")"
    cp -a "$config_root/$path" "$backup_root/config/$path"
  fi
done
printf '%s\n' "$backup_root" > "${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-backup"

rm -rf "$state_root"
rm -rf "$config_root/templates/$demo_template" "$config_root/integrations/$demo_integration"
rm -f "$config_root/integration-config/$demo_integration.json"
mkdir -p "$config_root"
chmod 700 "$config_root"

if [[ -f "$config_root/integration-state.json" ]]; then
  temporary="$config_root/integration-state.json.demo-tmp"
  jq --arg id "$demo_integration" '.enabled = ((.enabled // []) | map(select(. != $id)))' \
    "$config_root/integration-state.json" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$config_root/integration-state.json"
fi

privacy_tmp="$config_root/privacy.json.demo-tmp"
cat > "$privacy_tmp" <<'JSON'
{
  "version": 1,
  "defaultMode": "count-only",
  "applications": {
    "signal": "ignore",
    "github": "digest-and-handoff",
    "calendar": "digest-and-handoff",
    "omarchy": "digest-and-handoff",
    "omarchy-action": "ignore"
  }
}
JSON
chmod 600 "$privacy_tmp"
mv "$privacy_tmp" "$config_root/privacy.json"

cc -g3 -O0 -fno-omit-frame-pointer -o /tmp/crashing-sw "$repo_root/demo/crashing-sw.c"
chmod 755 /tmp/crashing-sw

omarchy-shell notifications setDnd off >/dev/null 2>&1 || true
omarchy restart shell

cat <<EOF
Demo state is ready.
Backup: $backup_root
Crash fixture: /tmp/crashing-sw
GitHub account: $(MISE_QUIET=1 /usr/bin/gh api user --jq .login)

Before running demo/notification-burst.sh, open OmaDigest once so its DND trigger is active.
EOF
