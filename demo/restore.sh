#!/usr/bin/env bash
set -euo pipefail

config_root="${XDG_CONFIG_HOME:-$HOME/.config}/omadigest"
state_root="${XDG_STATE_HOME:-$HOME/.local/state}/omadigest"
marker="${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-backup"
demo_integration="io.github.jacob-vincent-mink.github-inbox"
demo_template="github-triage"

if [[ ! -f "$marker" ]]; then
  echo "No OmaDigest demo backup marker was found." >&2
  exit 1
fi
backup_root="$(cat "$marker")"
if [[ ! -d "$backup_root" ]]; then
  echo "OmaDigest demo backup is unavailable: $backup_root" >&2
  exit 1
fi

rm -rf "$state_root"
mkdir -p "$state_root"
if [[ -d "$backup_root/state" ]]; then cp -a "$backup_root/state/." "$state_root/"; fi

rm -rf "$config_root/templates/$demo_template" "$config_root/integrations/$demo_integration"
rm -f "$config_root/integration-config/$demo_integration.json"
for path in privacy.json integration-state.json; do
  if [[ -f "$backup_root/config/$path" ]]; then
    mkdir -p "$config_root/$(dirname "$path")"
    cp -a "$backup_root/config/$path" "$config_root/$path"
  else
    rm -f "$config_root/$path"
  fi
done
for path in "templates/$demo_template" "integrations/$demo_integration" "integration-config/$demo_integration.json"; do
  if [[ -e "$backup_root/config/$path" ]]; then
    mkdir -p "$config_root/$(dirname "$path")"
    cp -a "$backup_root/config/$path" "$config_root/$path"
  fi
done

rm -f "$marker" /tmp/crashing-sw
omarchy restart shell
printf 'Restored pre-demo OmaDigest state from %s\n' "$backup_root"
