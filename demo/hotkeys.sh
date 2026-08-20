#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bindings="${XDG_CONFIG_HOME:-$HOME/.config}/hypr/bindings.lua"
backup_root="${XDG_STATE_HOME:-$HOME/.local/state}/omadigest-demo-hotkeys/backups"
begin_marker="-- BEGIN OMADIGEST DEMO HOTKEYS"
end_marker="-- END OMADIGEST DEMO HOTKEYS"

list_keys() {
  cat <<'KEYS'
Hyper = Super + Ctrl + Alt + Shift

P  Prepare/reset demo state       O  Toggle OmaDigest panel
S  Start screen recording         Q  Stop screen recording
N  Visible notification storm     F  Enter DND focus
H  Hidden/private focus events    R  Exit DND and trigger re-entry
J  Emit fresh PR #482 update
V  Open newest unread digest      U  Show Unread    E  Show Read
T  Load/copy template prompt
D  Submit prepared draft          A  Accept completed draft
G  Generate digest
X  Restore pre-demo state         K  Show shortcut help

Recordings are written to the repository's demo/recordings directory.
KEYS
}

rewrite_without_block() {
  local source_file="$1" target_file="$2"
  awk -v begin="$begin_marker" -v end="$end_marker" '
    $0 == begin { skipping = 1; next }
    $0 == end { skipping = 0; next }
    !skipping { print }
  ' "$source_file" > "$target_file"
}

apply_and_validate() {
  local temporary="$1" backup="$2"
  chmod --reference="$bindings" "$temporary"
  mv "$temporary" "$bindings"
  hyprctl reload >/dev/null
  sleep 0.3
  local errors
  errors="$(hyprctl configerrors | tr -d '[:space:]')"
  if [[ -n "$errors" ]]; then
    cp -a "$backup" "$bindings"
    hyprctl reload >/dev/null
    echo "Hyprland rejected the demo bindings; restored $backup" >&2
    hyprctl configerrors >&2
    exit 1
  fi
}

case "${1:-status}" in
  install)
    [[ -f "$bindings" ]] || { echo "Missing Hyprland bindings file: $bindings" >&2; exit 1; }
    [[ "$repo_root/demo/hotkeys.lua" != *']=]'* ]] || { echo "Unsupported checkout path." >&2; exit 1; }
    mkdir -p "$backup_root"
    backup="$backup_root/bindings.lua.$(date +%Y%m%d-%H%M%S)"
    cp -a "$bindings" "$backup"
    temporary="$(mktemp "${bindings}.omadigest.XXXXXX")"
    rewrite_without_block "$bindings" "$temporary"
    cat >> "$temporary" <<EOF

$begin_marker
dofile([=[$repo_root/demo/hotkeys.lua]=])
$end_marker
EOF
    apply_and_validate "$temporary" "$backup"
    echo "Installed OmaDigest demo hotkeys. Backup: $backup"
    list_keys
    ;;
  uninstall)
    if ! grep -Fxq -- "$begin_marker" "$bindings"; then echo "OmaDigest demo hotkeys are not installed."; exit 0; fi
    mkdir -p "$backup_root"
    backup="$backup_root/bindings.lua.$(date +%Y%m%d-%H%M%S)"
    cp -a "$bindings" "$backup"
    temporary="$(mktemp "${bindings}.omadigest.XXXXXX")"
    rewrite_without_block "$bindings" "$temporary"
    apply_and_validate "$temporary" "$backup"
    echo "Removed OmaDigest demo hotkeys. Backup: $backup"
    ;;
  status)
    if grep -Fxq -- "$begin_marker" "$bindings"; then
      echo "OmaDigest demo hotkeys are installed."
      hyprctl binds -j | jq -r '.[] | select((.description // "") | startswith("OmaDigest demo:")) | "\(.description)\t\(.key)"' | sort
    else echo "OmaDigest demo hotkeys are not installed."; fi
    ;;
  list) list_keys ;;
  *) echo "Usage: $0 {install|uninstall|status|list}" >&2; exit 2 ;;
esac
