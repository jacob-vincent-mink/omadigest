#!/usr/bin/env bash
set -euo pipefail

workspace="${1:-9}"
hyprctl eval "hl.dispatch(hl.dsp.focus({ workspace = \"$workspace\" })); return \"ok\"" >/dev/null
sleep 1
windows="$(hyprctl workspaces -j | jq --argjson id "$workspace" '[.[] | select(.id == $id) | .windows][0] // 0')"
if [[ "$windows" != "0" ]]; then
  echo "Workspace $workspace is not empty ($windows windows). Move them away before recording." >&2
  exit 1
fi

export OMARCHY_SCREENRECORD_DIR="${OMARCHY_SCREENRECORD_DIR:-$PWD/demo/recordings}"
mkdir -p "$OMARCHY_SCREENRECORD_DIR"
omarchy screenrecord --fullscreen
printf 'Recording isolated workspace %s. Use CUA for all visible interaction.\n' "$workspace"
