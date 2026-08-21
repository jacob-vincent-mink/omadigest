#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${XDG_RUNTIME_DIR:-/tmp}"
marker="$runtime_root/omadigest-demo-backup"
plugin_id="io.github.jacob-vincent-mink.omadigest"
log_file="$runtime_root/omadigest-demo-hotkeys.log"

notice() { notify-send --app-name="OmaDigest Demo" --urgency="${1:-low}" --expire-time=3500 "$2" "${3:-}"; }
fail() { notice critical "OmaDigest demo" "$1"; exit 1; }
panel_call() { omarchy-shell omadigest "$@"; }

require_omarchy_notifications() {
  busctl --user status org.freedesktop.Notifications 2>/dev/null | grep -Fxq 'Comm=quickshell' \
    || fail "Omarchy does not own notifications. Press Hyper+X, then Hyper+P."
}

prime_panel_listener() {
  omarchy-shell shell summon "$plugin_id" >/dev/null
  sleep 0.5
  omarchy-shell shell hide "$plugin_id" >/dev/null
}

copy_prompt() {
  local kind="$1" prompt_file request result
  prompt_file="$repo_root/demo/github-${kind}-prompt.txt"
  [[ -f "$prompt_file" ]] || fail "Missing $prompt_file"
  command -v wl-copy >/dev/null || fail "wl-copy is unavailable"
  request="$(<"$prompt_file")"
  printf '%s' "$request" | wl-copy
  result="$(panel_call prepareDraft "$kind" "$request")"
  [[ "$result" == "ok" ]] || fail "Could not prepare the $kind prompt ($result)."
}

case "${1:-help}" in
  prepare)
    [[ ! -f "$marker" ]] || fail "Demo state is already prepared."
    if "$repo_root/demo/prepare.sh" >>"$log_file" 2>&1; then
      notice low "OmaDigest demo ready" "Start recording, then trigger the visible storm."
    else fail "Preparation failed. See $log_file"; fi
    ;;
  record-start)
    pgrep -f '^gpu-screen-recorder( |$)' >/dev/null && fail "A screen recording is already running."
    require_omarchy_notifications
    prime_panel_listener
    "$repo_root/demo/start-recording.sh" 9 >>"$log_file" 2>&1 || fail "Recording could not start. See $log_file"
    ;;
  record-stop)
    pgrep -f '^gpu-screen-recorder( |$)' >/dev/null || fail "No screen recording is running."
    "$repo_root/demo/stop-recording.sh" >>"$log_file" 2>&1 || fail "Recording could not stop. See $log_file"
    ;;
  panel) omarchy-shell shell toggle "$plugin_id" >/dev/null ;;
  storm)
    [[ -f "$marker" ]] || fail "Prepare the demo first (Hyper+P)."
    require_omarchy_notifications
    exec 9>"$runtime_root/omadigest-demo-storm.lock"
    flock -n 9 || fail "A notification stage is already running."
    "$repo_root/demo/notification-burst.sh" --visible >>"$log_file" 2>&1 || fail "Visible storm failed. See $log_file"
    ;;
  focus-start)
    panel_call beginFocus >/dev/null
    omarchy-shell notifications setDnd on >/dev/null
    ;;
  focus-events)
    [[ -f "$marker" ]] || fail "Prepare the demo first (Hyper+P)."
    require_omarchy_notifications
    exec 9>"$runtime_root/omadigest-demo-storm.lock"
    flock -n 9 || fail "A notification stage is already running."
    "$repo_root/demo/notification-burst.sh" --focus >>"$log_file" 2>&1 || fail "Focus events failed. See $log_file"
    ;;
  reentry)
    omarchy-shell notifications setDnd off >/dev/null
    notify-send --app-name="Omarchy" --urgency=low --expire-time=4500 \
      "Focus session complete" "OmaDigest is preparing a digest."
    panel_call triggerFocusReentry 0 >/dev/null
    ;;
  pr-update)
    [[ -f "$marker" ]] || fail "Prepare the demo first (Hyper+P)."
    notify-send --app-name="GitHub" --urgency=normal --expire-time=4500 \
      "PR #482 updated" "Review feedback landed; prepare a focused pull-request report."
    ;;
  template-prompt) copy_prompt template ;;
  submit-draft)
    result="$(panel_call submitPreparedDraft)"
    [[ "$result" == "ok" ]] || fail "Load the template prompt first."
    ;;
  accept-draft)
    result="$(panel_call acceptDraft)"
    [[ "$result" == "ok" ]] || fail "There is no completed draft to accept."
    ;;
  generate)
    result="$(panel_call generate)"
    [[ "$result" == "ok" ]] || fail "Digest generation is unavailable ($result)."
    ;;
  open-newest)
    result="$(panel_call openNewest unread)"
    [[ "$result" == "ok" ]] || fail "There is no unread digest yet."
    ;;
  unread) panel_call showDigests unread >/dev/null ;;
  read) panel_call showDigests read >/dev/null ;;
  restore)
    omarchy-shell -q notifications setDnd off >/dev/null
    if [[ -f "$marker" ]]; then
      "$repo_root/demo/restore.sh" >>"$log_file" 2>&1 || fail "Restore failed. See $log_file"
      notice low "OmaDigest demo restored" "Your pre-demo state is back."
    else notice low "OmaDigest demo" "No prepared demo state needs restoring."; fi
    ;;
  help)
    body=$'S start recording · Q stop recording · P prepare · X restore\nN storm · F DND on · H focus events · R re-entry · J PR update\nO panel · V newest · U unread · E read · T load template · D submit · A accept · G generate'
    notice low "OmaDigest demo · Hyper shortcuts" "$body"
    ;;
  *) fail "Unknown demo action: $1" ;;
esac
