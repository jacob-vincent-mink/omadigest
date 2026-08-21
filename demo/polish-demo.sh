#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
input="${1:?usage: polish-demo.sh INPUT TIMELINE OUTPUT}"
timeline="${2:?usage: polish-demo.sh INPUT TIMELINE OUTPUT}"
output="${3:?usage: polish-demo.sh INPUT TIMELINE OUTPUT}"
speed="${OMADIGEST_DEMO_SPEED:-0.8}"

music_revision="cf011c7016595833b550a88ff127f089188b25f8"
music_url="https://raw.githubusercontent.com/0lhi/FreePD/${music_revision}/Miscellaneous/Study%20and%20Relax.mp3"
music_sha256="9cba2a3c2d1c9d364220db1691f618a0f25b8d9cf6f2a857fe389ef614fd18a4"
cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/omadigest-demo"
music="$cache_root/study-and-relax-${music_revision}.mp3"
work_root="$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/omadigest-polish.XXXXXX")"
subtitles="$work_root/feature-cards.ass"
trap 'find "$work_root" -depth -delete >/dev/null 2>&1 || true' EXIT

command -v curl >/dev/null
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
command -v sha256sum >/dev/null
[[ -s "$input" ]] || { echo "Input video is missing: $input" >&2; exit 1; }
[[ -s "$timeline" ]] || { echo "Scene timeline is missing: $timeline" >&2; exit 1; }

mkdir -p "$cache_root"
if [[ ! -s "$music" ]] || ! printf '%s  %s\n' "$music_sha256" "$music" | sha256sum --check --status; then
  partial="$music.partial"
  curl -L --fail --silent --show-error "$music_url" -o "$partial"
  printf '%s  %s\n' "$music_sha256" "$partial" | sha256sum --check --status \
    || { echo "Downloaded demo music failed checksum verification." >&2; exit 1; }
  mv "$partial" "$music"
fi

raw_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$input")"
finished_duration="$(awk -v duration="$raw_duration" -v rate="$speed" 'BEGIN { printf "%.3f", duration / rate }')"
fade_out="$(awk -v duration="$finished_duration" 'BEGIN { value = duration - 1.5; printf "%.3f", (value > 0 ? value : 0) }')"

cat > "$subtitles" <<'ASS'
[Script Info]
ScriptType: v4.00+
PlayResX: 3200
PlayResY: 2000
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Feature,JetBrainsMono Nerd Font,56,&H00F7F4F8,&H000000FF,&H50000000,&HC8000000,-1,0,0,0,100,100,0,0,3,2,0,7,110,110,145,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
ASS

ass_time() {
  awk -v seconds="$1" 'BEGIN {
    if (seconds < 0) seconds = 0
    hours = int(seconds / 3600)
    minutes = int((seconds - hours * 3600) / 60)
    remainder = seconds - hours * 3600 - minutes * 60
    printf "%d:%02d:%05.2f", hours, minutes, remainder
  }'
}

scene_index=0
while IFS=$'\t' read -r source_start label description; do
  [[ -n "$source_start" && -n "$description" ]] || continue
  scene_index=$((scene_index + 1))
  card_start="$(awk -v source="$source_start" -v rate="$speed" -v ordinal="$scene_index" \
    'BEGIN { value = source / rate - (ordinal > 1 ? 0.28 : 0); printf "%.3f", (value > 0 ? value : 0) }')"
  card_end="$(awk -v value="$card_start" 'BEGIN { printf "%.3f", value + 1.55 }')"
  safe_label="${label//\\/\\\\}"
  safe_label="${safe_label//\{/\\\{}"
  safe_label="${safe_label//\}/\\\}}"
  safe_description="${description//\\/\\\\}"
  safe_description="${safe_description//\{/\\\{}"
  safe_description="${safe_description//\}/\\\}}"
  printf 'Dialogue: 0,%s,%s,Feature,,0,0,0,,{\\fad(170,260)\\c&H00CC986E&\\fs30\\b1}%s{\\r\\fs56\\b1}\\N%s\n' \
    "$(ass_time "$card_start")" "$(ass_time "$card_end")" "$safe_label" "$safe_description" >> "$subtitles"
done < "$timeline"

mkdir -p "$(dirname "$output")"
ffmpeg -hide_banner -loglevel error -y \
  -i "$input" -i "$music" \
  -filter_complex \
    "[0:v]setpts=PTS/${speed},ass='${subtitles}'[video];[1:a]atrim=0:${finished_duration},afade=t=in:st=0:d=1.2,afade=t=out:st=${fade_out}:d=1.5,loudnorm=I=-21:LRA=8:TP=-2[audio]" \
  -map '[video]' -map '[audio]' -t "$finished_duration" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -movflags +faststart "$output"

actual_duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$output")"
if ! awk -v seconds="$actual_duration" 'BEGIN { exit !(seconds < 60) }'; then
  echo "The polished cut is ${actual_duration}s; it must remain under 60 seconds." >&2
  exit 1
fi

printf '%s (%0.1fs at %sx)\n' "$output" "$actual_duration" "$speed"
