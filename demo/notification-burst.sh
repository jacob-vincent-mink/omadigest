#!/usr/bin/env bash
set -euo pipefail

if [[ ! -x /tmp/crashing-sw ]]; then
  echo "Run demo/prepare.sh first." >&2
  exit 1
fi

notify() {
  local app="$1" urgency="$2" title="$3" body="$4"
  notify-send --app-name="$app" --urgency="$urgency" --expire-time=5000 "$title" "$body"
  sleep 0.35
}

visible_storm() {
  if [[ "$(omarchy-shell notifications isDnd)" == "on" ]]; then
    echo "Visible notification stage requires DND to be off." >&2
    return 1
  fi
  notify "GitHub" critical "Release workflow failed" \
    "voxtype/main · Deploy to GitHub Pages failed after packaging completed."
  notify "GitHub" normal "Review requested before launch" \
    "Two authentication changes are waiting for review in omarchy-omapilot."
  notify "Calendar" normal "Go/no-go moved to 2:00 PM" \
    "Release room · bring CI status and unresolved blockers."
  notify "GitHub" normal "PR #482 review requested" \
    "The release parser fix is ready for a final review."
  notify "GitHub" low "Documentation build completed" \
    "The API reference is ready for publication."
}

focus_events() {
  if [[ "$(omarchy-shell notifications isDnd)" != "on" ]]; then
    echo "Private focus events require DND to be on." >&2
    return 1
  fi
  # These remain real Omarchy notifications, but their protected content is
  # neither displayed nor admitted to digest evidence.
  notify "Signal" normal "Jamie" \
    "Private demo message: the launch code is 4821. This must never enter OmaDigest."

  set +e
  /tmp/crashing-sw >/tmp/crashing-sw.stdout 2>/tmp/crashing-sw.stderr
  crash_status=$?
  set -e
  if [[ $crash_status -eq 0 ]]; then
    echo "The crash fixture unexpectedly exited successfully." >&2
    return 1
  fi
  sleep 2
  notify "Omarchy" critical "Process crashed: crashing-sw" \
    "A release parser process dumped core. Diagnose the matching report."
  notify "GitHub" normal "Contributor workflow needs attention" \
    "The attribution check failed on a Wayland overlay branch in trycua/cua."
  notify "Calendar" low "Release notes checkpoint in 30 minutes" \
    "Confirm owners for remaining launch tasks."
  printf 'Private focus events complete; crashing-sw exited %d.\n' "$crash_status"
}

finish_focus() {
  omarchy-shell notifications setDnd off >/dev/null
  notify "Omarchy" low "Focus session complete" \
    "OmaDigest is preparing a concise release briefing."
}

case "${1:-all}" in
  --visible) visible_storm ;;
  --focus) focus_events ;;
  --hold-dnd)
    visible_storm
    omarchy-shell notifications setDnd on >/dev/null
    sleep 0.5
    focus_events
    ;;
  all)
    visible_storm
    omarchy-shell notifications setDnd on >/dev/null
    sleep 0.5
    focus_events
    sleep 1
    finish_focus
    ;;
  *) echo "Usage: $0 [--visible|--focus|--hold-dnd]" >&2; exit 2 ;;
esac
