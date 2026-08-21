#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace="${1:-9}"
plugin_id="io.github.jacob-vincent-mink.omadigest"
github_template="github-triage"
github_integration="io.github.jacob-vincent-mink.github"
output_dir="$repo_root/demo/recordings"
clip_root="$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-clips.XXXXXX")"
prepared=false
recording=false
clips=()
clip_pid=""
clip_path=""
clip_index=0
original_workspace="$(hyprctl activeworkspace -j | jq -r '.id')"
idle_was_enabled=false

log() { printf '[OmaDigest demo] %s\n' "$*"; }
refresh_recording_indicator() { omarchy-shell -q omarchy.indicators refresh >/dev/null 2>&1 || true; }

cleanup() {
  if $recording && [[ -n "$clip_pid" ]]; then
    kill -INT "$clip_pid" >/dev/null 2>&1 || true
    refresh_recording_indicator
  fi
  omarchy-shell -q notifications setDnd off >/dev/null 2>&1 || true
  omarchy-shell -q shell hide "$plugin_id" >/dev/null 2>&1 || true
  if $prepared; then "$repo_root/demo/restore.sh" >/dev/null 2>&1 || true; fi
  if $idle_was_enabled; then omarchy-shell -q idle enable >/dev/null 2>&1 || true; fi
  hyprctl eval "hl.dispatch(hl.dsp.focus({ workspace = \"$original_workspace\" })); return \"ok\"" >/dev/null 2>&1 || true
  find "$clip_root" -depth -delete >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

state() { omarchy-shell omadigest state; }

wait_for() {
  local expression="$1" description="$2" timeout_seconds="${3:-330}"
  local deadline=$((SECONDS + timeout_seconds)) current
  if ! jq -n "def demo_predicate: $expression; null" >/dev/null 2>&1; then
    echo "Invalid demo state predicate: $expression" >&2
    return 1
  fi
  while (( SECONDS < deadline )); do
    current="$(state 2>/dev/null || true)"
    if [[ -n "$current" ]] && jq -e "$expression" >/dev/null 2>&1 <<<"$current"; then
      log "Ready: $description"
      return 0
    fi
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
  refresh_recording_indicator
  log "Recording clip $clip_index"
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
  refresh_recording_indicator
  [[ -s "$clip_path" ]] || { echo "A recording clip was not produced." >&2; return 1; }
  clips+=("$clip_path")
  log "Captured clip $clip_index"
  clip_pid=""
  sleep 0.35
}

command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
command -v jq >/dev/null
command -v notify-send >/dev/null
command -v gpu-screen-recorder >/dev/null
command -v gh >/dev/null
gh auth status --hostname github.com >/dev/null 2>&1 \
  || { echo "The bundled GitHub demo requires an authenticated gh session." >&2; exit 1; }
[[ -x "$repo_root/runtime/dist/omadigest-broker.mjs" ]] || { echo "Run npm run build first." >&2; exit 1; }
[[ ! -f "${XDG_RUNTIME_DIR:-/tmp}/omadigest-demo-backup" ]] || { echo "Demo state is already prepared; restore it first." >&2; exit 1; }
[[ "$(busctl --user status org.freedesktop.Notifications 2>/dev/null | sed -n 's/^Comm=//p')" == "quickshell" ]] \
  || { echo "Quickshell does not own desktop notifications." >&2; exit 1; }

if jq -e '.enabled == true' >/dev/null 2>&1 <<<"$(omarchy-shell idle status 2>/dev/null || echo '{}')"; then
  idle_was_enabled=true
  omarchy-shell idle disable >/dev/null
fi

log "Preparing isolated state"
"$repo_root/demo/prepare.sh" >/dev/null
prepared=true
wait_for '.ready == true' 'the OmaDigest broker' 30

# Use the real bundled GitHub connector and expose its live status in the take.
omarchy-shell omadigest checkIntegration "$github_integration" >/dev/null
wait_for '.integrationStatus["io.github.jacob-vincent-mink.github"].ready == true' 'the GitHub CLI connection' 30
omarchy-shell omadigest enableIntegration "$github_integration" >/dev/null
wait_for '.integrations | any(.id == "io.github.jacob-vincent-mink.github" and .enabled == true)' 'the enabled GitHub connector' 30

# Prime the panel's notification listener before the focus transition.
omarchy-shell shell summon "$plugin_id" >/dev/null
sleep 0.6
omarchy-shell shell hide "$plugin_id" >/dev/null

# 00:00 — Hook: real Omarchy notifications arrive in quick succession.
log "Scene 1/10: real notification burst"
start_clip
"$repo_root/demo/notification-burst.sh" --visible >/dev/null
sleep 0.7
stop_clip
omarchy-shell shell hide "$plugin_id" >/dev/null 2>&1 || true

# The private and system focus events are real, but happen off camera while DND
# is active so the cut stays fast and protected content never appears.
omarchy-shell omadigest beginFocus >/dev/null
omarchy-shell notifications setDnd on >/dev/null
"$repo_root/demo/notification-burst.sh" --focus >/dev/null

# 00:03 — Re-entry starts a real automatic digest; the model wait is cut.
log "Scene 2/10: focus re-entry"
start_clip
omarchy-shell notifications setDnd off >/dev/null
notify-send --app-name="Omarchy" --urgency=low --expire-time=4500 \
  "Focus session complete" "OmaDigest is preparing a concise release briefing."
wait_for '.digestState == "working" or (.digestState == "ready" and .unreadCount > 0)' 'focus re-entry generation to start' 20
sleep 0.8
stop_clip
wait_for '.digestState == "ready" and .unreadCount > 0 and (.digestTitle | length) > 0 and .digestTitle != "Today’s digest" and .digestTitle != "Today\u0027s digest"' 'the automatic digest'

# 00:05 — Open the specific briefing, then prove reading moved it to Read.
log "Scene 3/10: actionable briefing and automatic read state"
start_clip
omarchy-shell omadigest showDigests unread >/dev/null
sleep 1.2
omarchy-shell omadigest openNewest unread >/dev/null
wait_for '.unreadCount == 0 and .readCount > 0' 'the automatic read-state update' 15
sleep 3.4
omarchy-shell omadigest showDigests read >/dev/null
sleep 1.2
stop_clip

# 00:11 — Scan the broad source catalog, then punch into live GitHub categories.
log "Scene 4/10: source catalog and GitHub controls"
start_clip
omarchy-shell omadigest showSettings integrations >/dev/null
sleep 2.7
[[ "$(omarchy-shell omadigest showSource "$github_integration")" == "ok" ]]
wait_for '.sourcesView == "detail" and .selectedSourceId == "io.github.jacob-vincent-mink.github"' 'the GitHub source detail' 10
sleep 3.4
stop_clip

# 00:18 — Show learned pattern suggestion, then both packaged-template editors.
wait_for '(.templateSuggestions | length) > 0' 'an evidence-backed template suggestion' 15
log "Scene 5/10: smart suggestion and two template editing modes"
start_clip
omarchy-shell omadigest showSettings templates >/dev/null
sleep 1.8
omarchy-shell omadigest showTemplate focus-reentry >/dev/null
sleep 1.0
omarchy-shell omadigest editTemplate focus-reentry manual >/dev/null
sleep 1.5
omarchy-shell omadigest editTemplate focus-reentry agent >/dev/null
sleep 2.0
stop_clip

# 00:23 — Submit a real template request, cutting only the model wait.
log "Scene 6/10: submit a GitHub triage template"
template_request="$(<"$repo_root/demo/github-template-prompt.txt")"
omarchy-shell omadigest prepareDraft template "$template_request" >/dev/null
start_clip
sleep 1.2
omarchy-shell omadigest submitDraft template >/dev/null
wait_for '(.draftState == "working" or .draftState == "ready") and .draftKind == "template"' 'template drafting to start' 15
sleep 1.1
stop_clip
wait_for '.draftState == "working" and (.draftPlan | length) > 0' 'the template work plan' 90

# 00:26 — Resume on the model-authored plan instead of a static spinner.
log "Scene 7/10: model-authored work plan"
start_clip
omarchy-shell omadigest showDraft template >/dev/null
sleep 3.4
stop_clip
wait_for '.draftState == "ready" and .draftKind == "template"' 'the template draft'

# 00:30 — Review, accept, and immediately inspect the deterministic result.
log "Scene 8/10: review and install the template"
start_clip
omarchy-shell omadigest showDraft template >/dev/null
sleep 3.0
omarchy-shell omadigest acceptDraft >/dev/null
wait_for '.draftState == "saved"' 'the installed template' 30
sleep 0.8
omarchy-shell omadigest showTemplate "$github_template" >/dev/null
sleep 2.4
stop_clip

# 00:37 — One more real notification routes through the newly installed template.
log "Scene 9/10: route PR #482 through the new template"
omarchy-shell shell hide "$plugin_id" >/dev/null 2>&1 || true
start_clip
notify-send --app-name="GitHub" --urgency=normal --expire-time=4500 \
  "PR #482 updated" "Review feedback landed; prepare a focused pull-request report."
wait_for '.attentionCount > 0' 'fresh GitHub attention' 15
sleep 0.8
omarchy-shell omadigest showDigests unread >/dev/null
sleep 0.8
omarchy-shell omadigest generate >/dev/null
wait_for '.digestState == "working" or (.digestState == "ready" and .digestTemplateId == "github-triage")' 'PR report generation to start' 15
sleep 0.8
stop_clip
omarchy-shell shell hide "$plugin_id" >/dev/null 2>&1 || true
wait_for '.digestState == "ready" and .digestTemplateId == "github-triage" and (.digestTitle | test("482|PR"; "i")) and .readCount > 0' 'the template-routed PR digest'
final_state="$(state)"
jq -e '.digestTemplateId == "github-triage" and (.digestTitle | test("482|PR"; "i"))' >/dev/null <<<"$final_state" \
  || { echo "The final digest did not expose the expected PR-specific title/template." >&2; exit 1; }

# 00:41 — Payoff: a specifically named report with citations and agent action.
log "Scene 10/10: PR-specific report payoff"
start_clip
omarchy-shell omadigest openCurrent >/dev/null
sleep 5.0
stop_clip

mkdir -p "$output_dir"
concat_file="$clip_root/concat.txt"
for clip in "${clips[@]}"; do printf "file '%s'\n" "$clip" >> "$concat_file"; done
output="$output_dir/omadigest-demo-$(date +%Y%m%d-%H%M%S).mp4"
ffmpeg -hide_banner -loglevel error -f concat -safe 0 -i "$concat_file" -c copy "$output"
duration="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$output")"
if ! awk -v seconds="$duration" 'BEGIN { exit !(seconds < 60) }'; then
  echo "The finished cut is ${duration}s; the sizzle reel must remain under 60 seconds." >&2
  exit 1
fi

"$repo_root/demo/restore.sh" >/dev/null
prepared=false
if $idle_was_enabled; then
  omarchy-shell idle enable >/dev/null
  idle_was_enabled=false
fi
hyprctl eval "hl.dispatch(hl.dsp.focus({ workspace = \"$original_workspace\" })); return \"ok\"" >/dev/null
trap - EXIT INT TERM
find "$clip_root" -depth -delete
log "Finished"
printf '%s (%0.1fs)\n' "$output" "$duration"
