#!/usr/bin/env bash
# diff-summary.sh — summarizes what changed since the last recorded wiki state, so
# the update skill can scope surgical edits (OpenWiki's "≤1-2 pages when <5 files
# changed" discipline). Reads the prior gitHead from openwiki/.last-update.json.
#
# Emits:
#   {"stateGitHead":str,"currentHead":str,"commitsSince":int,"changedFiles":int,
#    "sourceChanged":bool,"worktreeDirty":bool,
#    "commits":[{"sha":str,"subject":str}],"files":[{"status":str,"path":str}]}
# Exit 0 = evaluated, 2 = not a git repo.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

DIR="."
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=$2; shift 2 ;;
    *) printf 'diff-summary.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

WIKI_DIR="openwiki"
STATE_PATH="openwiki/.last-update.json"
STATE_FILE="$DIR/$STATE_PATH"

git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1 || {
  printf 'diff-summary.sh: %s is not a git repository\n' "$DIR" >&2
  exit 2
}

current_head=$(git -C "$DIR" rev-parse HEAD 2>/dev/null || printf '')
state_git_head=""
if [ -f "$STATE_FILE" ]; then
  state_git_head=$(sed -n 's/.*"gitHead"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$STATE_FILE" | head -1)
fi

# worktree dirty (excluding the state file), for the model's awareness
worktree_dirty=false
status=$(git -C "$DIR" status --porcelain --untracked-files=all 2>/dev/null || printf '')
while IFS= read -r line; do
  [ -z "$line" ] && continue
  p=${line:3}; [ -z "$p" ] && p=$line
  p=${p//\\//}; p=${p%"${p##*[![:space:]]}"}
  [ "$p" = "$STATE_PATH" ] && continue
  worktree_dirty=true
  break
done <<EOF
$status
EOF

commits_since=0
changed_files=0
source_changed=false
commits_json="[]"
files_json="[]"
range_ok=0

if [ -n "$state_git_head" ] && git -C "$DIR" cat-file -e "$state_git_head^{commit}" 2>/dev/null; then
  range_ok=1
  commits_since=$(git -C "$DIR" rev-list --count "$state_git_head..HEAD" 2>/dev/null || printf '0')

  # commits: %H<US>%s per line
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
$(git -C "$DIR" log --format='%H%x1f%s' "$state_git_head..HEAD" 2>/dev/null || printf '')
EOF
  commits_json+="]"

  # files: name-status; take first token as status, last token as path (rename-safe)
  files_json="["
  first=1
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    st=${line%%$'\t'*}
    path=${line##*$'\t'}
    path=${path//\\//}
    changed_files=$((changed_files + 1))
    if [ "$path" != "$WIKI_DIR" ] && [ "${path#"$WIKI_DIR"/}" = "$path" ]; then
      source_changed=true
    fi
    [ "$first" -eq 1 ] || files_json+=","
    files_json+="{\"status\":$(json_str "$st"),\"path\":$(json_str "$path")}"
    first=0
  done <<EOF
$(git -C "$DIR" diff --name-status "$state_git_head..HEAD" 2>/dev/null || printf '')
EOF
  files_json+="]"
fi

# When we have no usable prior state, commitsSince stays 0 and arrays empty; the
# update skill treats that as "no diff baseline" and falls back to broader review.
if [ "$range_ok" -eq 0 ]; then
  commits_since=0
fi

printf '{"stateGitHead":%s,"currentHead":%s,"commitsSince":%s,"changedFiles":%s,"sourceChanged":%s,"worktreeDirty":%s,"commits":%s,"files":%s}\n' \
  "$(json_str "$state_git_head")" "$(json_str "$current_head")" "$commits_since" \
  "$changed_files" "$source_changed" "$worktree_dirty" "$commits_json" "$files_json"
