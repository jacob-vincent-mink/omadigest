#!/usr/bin/env bash
set -euo pipefail

config_root="${XDG_CONFIG_HOME:-$HOME/.config}/omadigest"
state_root="${XDG_STATE_HOME:-$HOME/.local/state}/omadigest"
notification_state_root="${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/notifications"
marker="${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-backup"
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

rm -rf "$config_root/templates/$demo_template"
for path in privacy.json integration-state.json; do
  if [[ -f "$backup_root/config/$path" ]]; then
    mkdir -p "$config_root/$(dirname "$path")"
    cp -a "$backup_root/config/$path" "$config_root/$path"
  else
    rm -f "$config_root/$path"
  fi
done
for path in "templates/$demo_template"; do
  if [[ -e "$backup_root/config/$path" ]]; then
    mkdir -p "$config_root/$(dirname "$path")"
    cp -a "$backup_root/config/$path" "$config_root/$path"
  fi
done

if [[ -d "$backup_root/omarchy-notifications" ]]; then
  omarchy-shell notifications dismissAll >/dev/null 2>&1 || true
  omarchy-shell notifications clear >/dev/null 2>&1 || true
  sleep 1
  rm -rf "$notification_state_root"
  mkdir -p "$notification_state_root"
  cp -a "$backup_root/omarchy-notifications/." "$notification_state_root/"
fi

rm -f "$marker" /tmp/crashing-sw

# Keep the legacy fallback daemon from claiming the notification bus during
# the shell restart gap. The restore completion notice is only safe after
# Quickshell owns org.freedesktop.Notifications again.
systemctl --user stop mako.service >/dev/null 2>&1 || true
systemctl --user unset-environment OMADIGEST_DEMO_IPC
omarchy restart shell


notification_owner_ready=false
for _ in {1..50}; do
  if busctl --user status org.freedesktop.Notifications 2>/dev/null | grep -Fxq 'Comm=quickshell'; then
    notification_owner_ready=true
    break
  fi
  sleep 0.1
done
if [[ "$notification_owner_ready" != true ]]; then
  echo "Omarchy shell did not acquire org.freedesktop.Notifications after restore." >&2
  busctl --user status org.freedesktop.Notifications >&2 || true
  exit 1
fi

printf 'Restored pre-demo OmaDigest state from %s\n' "$backup_root"
