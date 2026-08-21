#!/usr/bin/env bash
set -euo pipefail

config_root="${XDG_CONFIG_HOME:-$HOME/.config}/omadigest"
state_root="${XDG_STATE_HOME:-$HOME/.local/state}/omadigest"
notification_state_root="${XDG_STATE_HOME:-$HOME/.local/state}/omarchy/notifications"
backup_root="${XDG_STATE_HOME:-$HOME/.local/state}/omadigest-demo-backups/$(date +%Y%m%d-%H%M%S)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
demo_template="github-triage"

mkdir -p "$backup_root/config" "$backup_root/state"
chmod 700 "$backup_root" "$backup_root/config" "$backup_root/state"

if [[ -d "$state_root" ]]; then cp -a "$state_root/." "$backup_root/state/"; fi
if [[ -d "$notification_state_root" ]]; then
  mkdir -p "$backup_root/omarchy-notifications"
  cp -a "$notification_state_root/." "$backup_root/omarchy-notifications/"
fi
for path in privacy.json integration-state.json; do
  if [[ -f "$config_root/$path" ]]; then cp -a "$config_root/$path" "$backup_root/config/$path"; fi
done
for path in "templates/$demo_template"; do
  if [[ -e "$config_root/$path" ]]; then
    mkdir -p "$backup_root/config/$(dirname "$path")"
    cp -a "$config_root/$path" "$backup_root/config/$path"
  fi
done
printf '%s\n' "$backup_root" > "${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-backup"

rm -rf "$state_root"
rm -rf "$config_root/templates/$demo_template"
mkdir -p "$config_root"
chmod 700 "$config_root"

privacy_tmp="$config_root/privacy.json.demo-tmp"
cat > "$privacy_tmp" <<'JSON'
{
  "version": 1,
  "defaultMode": "count-only",
  "applications": {
    "github": "digest-and-handoff",
    "calendar": "digest-and-handoff",
    "omarchy": "digest-and-handoff",
    "omadigest demo": "ignore",
    "omarchy-action": "ignore"
  }
}
JSON
chmod 600 "$privacy_tmp"
mv "$privacy_tmp" "$config_root/privacy.json"

cc -g3 -O0 -fno-omit-frame-pointer -o /tmp/crashing-sw "$repo_root/demo/crashing-sw.c"
chmod 755 /tmp/crashing-sw

omarchy-shell notifications setDnd off >/dev/null 2>&1 || true
omarchy-shell notifications dismissAll >/dev/null 2>&1 || true
omarchy-shell notifications clear >/dev/null 2>&1 || true
sleep 1

# A notify-send during the shell restart gap can D-Bus-activate the legacy
# Mako service. It then keeps org.freedesktop.Notifications, leaving Omarchy's
# notification model—and therefore OmaDigest—blind to the demo storm.
systemctl --user stop mako.service >/dev/null 2>&1 || true
systemctl --user set-environment OMADIGEST_DEMO_IPC=1
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
  echo "Omarchy shell did not acquire org.freedesktop.Notifications." >&2
  busctl --user status org.freedesktop.Notifications >&2 || true
  exit 1
fi

cat <<EOF
Demo state is ready.
Backup: $backup_root
Crash fixture: /tmp/crashing-sw

For a manual take, use demo/hotkeys.sh and the staged Hyper shortcuts in demo/README.md.
EOF
