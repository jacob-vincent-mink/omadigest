#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace="${1:-9}"
plugin_id="io.github.jacob-vincent-mink.omadigest"
github_integration="io.github.jacob-vincent-mink.github-inbox"
github_template="github-triage"
output_dir="$repo_root/demo/recordings"
clip_root="$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-clips.XXXXXX")"
prepared=false
recording=false
clips=()
clip_pid=""
clip_path=""
clip_index=0

cleanup() {
  if $recording && [[ -n "$clip_pid" ]]; then kill -INT "$clip_pid" >/dev/null 2>&1 || true; fi
  omarchy-shell -q notifications setDnd off >/dev/null 2>&1 || true
  omarchy-shell -q shell hide "$plugin_id" >/dev/null 2>&1 || true
  if $prepared; then "$repo_root/demo/restore.sh" >/dev/null 2>&1 || true; fi
  rm -rf "$clip_root"
}
trap cleanup EXIT INT TERM

state() { omarchy-shell omadigest state; }

wait_for() {
  local expression="$1" description="$2" timeout_seconds="${3:-330}"
  local deadline=$((SECONDS + timeout_seconds)) current
  while (( SECONDS < deadline )); do
    current="$(state 2>/dev/null || true)"
    if [[ -n "$current" ]] && jq -e "$expression" >/dev/null 2>&1 <<<"$current"; then return 0; fi
    if [[ -n "$current" ]] && jq -e '.errorCode != ""' >/dev/null 2>&1 <<<"$current"; then
      jq -r '"OmaDigest error: " + .errorCode + ": " + .errorMessage' <<<"$current" >&2
      return 1
    fi
    sleep 0.25
  done
  echo "Timed out waiting for $description." >&2
  return 1
}

start_clip() {
  hyprctl eval "hl.dispatch(hl.dsp.focus({ workspace = \"$workspace\" })); return \"ok\"" >/dev/null
  local windows monitor
  windows="$(hyprctl clients -j | jq --argjson id "$workspace" '[.[] | select(.workspace.id == $id)] | length')"
  [[ "$windows" == "0" ]] || { echo "Workspace $workspace is not empty ($windows windows)." >&2; return 1; }
  monitor="$(omarchy-hyprland-monitor-focused)"
  clip_index=$((clip_index + 1))
  clip_path="$clip_root/clip-$(printf '%02d' "$clip_index").mp4"
  gpu-screen-recorder -w "$monitor" -s 0x0 -k auto -f 60 -fm cfr \
    -fallback-cpu-encoding yes -o "$clip_path" 2>>"$clip_root/recorder.log" &
  clip_pid=$!
  local attempts=0
  while kill -0 "$clip_pid" 2>/dev/null && [[ ! -f "$clip_path" ]] && (( attempts < 50 )); do
    sleep 0.1
    attempts=$((attempts + 1))
  done
  kill -0 "$clip_pid" 2>/dev/null || { echo "The demo recorder failed to start." >&2; return 1; }
  recording=true
  sleep 0.35
}

stop_clip() {
  kill -INT "$clip_pid"
  local attempts=0
  while kill -0 "$clip_pid" 2>/dev/null && (( attempts < 100 )); do
    sleep 0.1
    attempts=$((attempts + 1))
  done
  if kill -0 "$clip_pid" 2>/dev/null; then
    echo "The demo recorder did not finish cleanly." >&2
    return 1
  fi
  recording=false
  [[ -s "$clip_path" ]] || { echo "A recording clip was not produced." >&2; return 1; }
  clips+=("$clip_path")
  clip_pid=""
  sleep 0.35
}

command -v ffmpeg >/dev/null
command -v jq >/dev/null
command -v notify-send >/dev/null
command -v gpu-screen-recorder >/dev/null
[[ -x "$repo_root/runtime/dist/omadigest-broker.mjs" ]] || { echo "Run npm run build first." >&2; exit 1; }

"$repo_root/demo/prepare.sh" >/dev/null
prepared=true
wait_for '.ready == true' 'the OmaDigest broker' 30

# Prime the panel's notification listener before the focus transition.
omarchy-shell shell summon "$plugin_id" >/dev/null
sleep 0.6
omarchy-shell shell hide "$plugin_id" >/dev/null

# Scene 1: real Omarchy notifications, then an automatic focus-reentry digest.
start_clip
"$repo_root/demo/notification-burst.sh" >/dev/null
sleep 1.2
stop_clip
wait_for '.digestState == "ready" && .unreadCount > 0' 'the automatic digest'

# Scene 2: opening the briefing marks it read; prove it moved to Read.
start_clip
omarchy-shell omadigest openNewest unread >/dev/null
wait_for '.unreadCount == 0 && .readCount > 0' 'the automatic read-state update' 15
sleep 3.5
omarchy-shell omadigest showDigests read >/dev/null
sleep 1.8
omarchy-shell omadigest openNewest read >/dev/null
sleep 2.4
stop_clip

# Scene 3: fill and submit the real scoped integration request; omit model wait.
integration_request="$(<"$repo_root/demo/github-integration-prompt.txt")"
omarchy-shell omadigest prepareDraft integration "$integration_request" >/dev/null
start_clip
sleep 1.8
omarchy-shell omadigest submitDraft integration >/dev/null
sleep 1.0
stop_clip
wait_for '.draftState == "ready" && .draftKind == "integration"' 'the integration draft'

# Scene 4: review, accept, configure, and enable the generated integration.
start_clip
omarchy-shell omadigest showDraft integration >/dev/null
sleep 3.5
omarchy-shell omadigest acceptDraft >/dev/null
wait_for '.draftState == "saved"' 'the installed integration' 30
sleep 1.2
omarchy-shell omadigest setupIntegrationDefaults "$github_integration" >/dev/null
wait_for '.integrationSetup["io.github.jacob-vincent-mink.github-inbox"].ready == true' 'GitHub integration readiness' 30
sleep 1.0
omarchy-shell omadigest enableIntegration "$github_integration" >/dev/null
wait_for '.integrations | any(.id == "io.github.jacob-vincent-mink.github-inbox" and .enabled == true)' 'the enabled GitHub integration' 30
sleep 2.0
stop_clip

# Scene 5: fill and submit the template request, again cutting only the wait.
template_request="$(<"$repo_root/demo/github-template-prompt.txt")"
omarchy-shell omadigest prepareDraft template "$template_request" >/dev/null
start_clip
sleep 1.8
omarchy-shell omadigest submitDraft template >/dev/null
sleep 1.0
stop_clip
wait_for '.draftState == "ready" && .draftKind == "template"' 'the template draft'

# Scene 6: accept and inspect the resulting deterministic template.
start_clip
omarchy-shell omadigest showDraft template >/dev/null
sleep 3.2
omarchy-shell omadigest acceptDraft >/dev/null
wait_for '.draftState == "saved"' 'the installed template' 30
sleep 1.2
omarchy-shell omadigest showTemplate "$github_template" >/dev/null
sleep 3.0
stop_clip

# Scene 7: a real notification supplies fresh attention; GitHub enriches it.
notify-send --app-name="GitHub" --urgency=normal --expire-time=4500 \
  "PR #482 updated" "Review feedback landed; prepare a focused pull-request report."
sleep 0.8
wait_for '.attentionCount > 0' 'fresh GitHub attention' 15
start_clip
omarchy-shell omadigest showDigests unread >/dev/null
sleep 1.0
omarchy-shell omadigest generate >/dev/null
sleep 1.0
stop_clip
wait_for '.digestState == "ready" && .unreadCount > 0' 'the GitHub-enriched digest'

start_clip
omarchy-shell omadigest openNewest unread >/dev/null
sleep 4.0
stop_clip

mkdir -p "$output_dir"
concat_file="$clip_root/concat.txt"
for clip in "${clips[@]}"; do printf "file '%s'\n" "$clip" >> "$concat_file"; done
output="$output_dir/omadigest-demo-$(date +%Y%m%d-%H%M%S).mp4"
ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$concat_file" -c copy "$output"

"$repo_root/demo/restore.sh" >/dev/null
prepared=false
trap - EXIT INT TERM
rm -rf "$clip_root"
printf '%s\n' "$output"
