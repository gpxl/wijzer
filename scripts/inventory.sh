#!/usr/bin/env bash
# inventory.sh — cheap, bounded repository inventory for the init skill: manifests,
# likely entrypoints, recent git history, a tracked-file sample, and an extension
# histogram. Feeds discovery WITHOUT the model reading the whole tree (OpenWiki's
# "run discipline": discover via manifests/entrypoints, no exhaustive reads).
#
# Emits a single JSON object (see keys below).
# Exit 0 = evaluated, 2 = not a git repo.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

DIR="."
MAX_FILES=200
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=$2; shift 2 ;;
    --max-files) MAX_FILES=$2; shift 2 ;;
    *) printf 'inventory.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1 || {
  printf 'inventory.sh: %s is not a git repository\n' "$DIR" >&2
  exit 2
}

root=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$DIR")

# tracked files (single source of truth for the rest)
tracked=$(git -C "$DIR" ls-files 2>/dev/null || printf '')
tracked_count=$(printf '%s\n' "$tracked" | grep -c . || true)

json_array_from_lines() {
  # reads newline-delimited items on stdin -> JSON array of strings
  local out="[" first=1 item
  while IFS= read -r item; do
    [ -z "$item" ] && continue
    [ "$first" -eq 1 ] || out+=","
    out+="$(json_str "$item")"
    first=0
  done
  out+="]"
  printf '%s' "$out"
}

# --- manifests present at repo root ---
manifest_candidates="package.json pnpm-workspace.yaml turbo.json deno.json \
pyproject.toml requirements.txt setup.py Pipfile \
Cargo.toml go.mod pom.xml build.gradle build.gradle.kts settings.gradle \
Gemfile composer.json Package.swift Project.swift \
CMakeLists.txt Makefile Dockerfile flake.nix"
manifests_found=""
for m in $manifest_candidates; do
  [ -e "$DIR/$m" ] && manifests_found+="$m"$'\n'
done
manifests_json=$(printf '%s' "$manifests_found" | json_array_from_lines)

# --- likely entrypoints (best effort, from tracked files) ---
# `|| true`: grep exits 1 when a repo has no entrypoint matches; without the
# guard, pipefail + set -e would abort the whole inventory. The array is already
# captured from stdout regardless of the pipeline's exit status.
entrypoints_json=$(printf '%s\n' "$tracked" | grep -Ei \
  '(^|/)(index|main|app|cli|server)\.[a-z]+$|^(src/(index|main)\.[a-z]+)$|^cmd/|^bin/' \
  2>/dev/null | awk 'NR<=40' | json_array_from_lines || true)

# --- recent commits ---
commits_json="["
first=1
while IFS= read -r line; do
  [ -z "$line" ] && continue
  sha=${line%%$'\x1f'*}
  subject=${line#*$'\x1f'}
  [ "$first" -eq 1 ] || commits_json+=","
  commits_json+="{\"sha\":$(json_str "$sha"),\"subject\":$(json_str "$subject")}"
  first=0
done <<EOF
$(git -C "$DIR" log --max-count=20 --format='%H%x1f%s' 2>/dev/null || printf '')
EOF
commits_json+="]"

# --- extension histogram (top 10) ---
ext_json="["
first=1
while IFS= read -r line; do
  [ -z "$line" ] && continue
  count=${line%% *}
  ext=${line#* }
  [ "$first" -eq 1 ] || ext_json+=","
  ext_json+="{\"ext\":$(json_str "$ext"),\"count\":$count}"
  first=0
done <<EOF
$(printf '%s\n' "$tracked" | sed -n 's/.*\(\.[A-Za-z0-9_]*\)$/\1/p' | LC_ALL=C sort | uniq -c | sort -rn | awk 'NR<=10' | sed 's/^ *//')
EOF
ext_json+="]"

# --- bounded sample of tracked files ---
# awk (not head) so the producer is never SIGPIPE'd when the list exceeds the cap.
sample_json=$(printf '%s\n' "$tracked" | awk -v n="$MAX_FILES" 'NR<=n' | json_array_from_lines)

printf '{"root":%s,"trackedFileCount":%s,"manifests":%s,"entrypoints":%s,"recentCommits":%s,"topExtensions":%s,"sampleFiles":%s,"sampleTruncated":%s}\n' \
  "$(json_str "$root")" "${tracked_count:-0}" "$manifests_json" "$entrypoints_json" \
  "$commits_json" "$ext_json" "$sample_json" \
  "$([ "${tracked_count:-0}" -gt "$MAX_FILES" ] && printf true || printf false)"
