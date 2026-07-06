#!/usr/bin/env bash
# check-noop.sh — port of OpenWiki's getUpdateNoopStatus + shouldCheckUpdateNoop
# (src/agent/utils.ts). Decides whether a `wijzer:update` run is a no-op, so the
# update skill can STOP without touching the wiki (churn prevention parity).
#
# Emits a single JSON object on stdout:
#   {"noop":bool,"checkNoop":bool,"reason":str,"gitHead":str,
#    "stateGitHead":str,"dirty":bool,"commitsSince":int}
# Exit codes: 0 = evaluated, 2 = precondition missing (not a git repo).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

DIR="."
USER_MESSAGE=""
HAS_USER_MESSAGE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=$2; shift 2 ;;
    --user-message) USER_MESSAGE=$2; HAS_USER_MESSAGE=1; shift 2 ;;
    *) printf 'check-noop.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

WIKI_DIR="openwiki"
STATE_PATH="openwiki/.last-update.json"
STATE_FILE="$DIR/$STATE_PATH"

git -C "$DIR" rev-parse --git-dir >/dev/null 2>&1 || {
  printf 'check-noop.sh: %s is not a git repository\n' "$DIR" >&2
  exit 2
}

emit() {
  # emit NOOP CHECKNOOP REASON GITHEAD STATEHEAD DIRTY COMMITS
  printf '{"noop":%s,"checkNoop":%s,"reason":%s,"gitHead":%s,"stateGitHead":%s,"dirty":%s,"commitsSince":%s}\n' \
    "$1" "$2" "$(json_str "$3")" "$(json_str "$4")" "$(json_str "$5")" "$6" "$7"
}

# --- shouldCheckUpdateNoop: only check when no non-whitespace user message ---
trimmed=$(printf '%s' "$USER_MESSAGE" | tr -d '[:space:]')
if [ "$HAS_USER_MESSAGE" -eq 1 ] && [ -n "$trimmed" ]; then
  head=$(git -C "$DIR" rev-parse HEAD 2>/dev/null || printf '')
  emit false false "user message provided" "$head" "" false 0
  exit 0
fi

# --- read prior state ---
state_git_head=""
if [ -f "$STATE_FILE" ]; then
  state_git_head=$(sed -n 's/.*"gitHead"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$STATE_FILE" | head -1)
fi
if [ -z "$state_git_head" ]; then
  emit false true "missing previous update git head" "" "" false 0
  exit 0
fi

# --- current HEAD ---
head=$(git -C "$DIR" rev-parse HEAD 2>/dev/null || printf '')
if [ -z "$head" ]; then
  emit false true "missing current git head" "" "$state_git_head" false 0
  exit 0
fi

# --- worktree status, excluding the state file itself ---
status=$(git -C "$DIR" status --short --untracked-files=all 2>/dev/null || printf '')
meaningful=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  # strip the two status chars + separating space; tolerate short lines
  path=${line:3}
  [ -z "$path" ] && path=$line
  path=${path//\\//}          # normalize backslashes
  path=${path%"${path##*[![:space:]]}"}  # rtrim
  # ignore the metadata file (and its rename form "old -> state")
  if [ "$path" = "$STATE_PATH" ] || [ "${path%" -> $STATE_PATH"}" != "$path" ]; then
    continue
  fi
  meaningful=$((meaningful + 1))
done <<EOF
$status
EOF

if [ "$meaningful" -gt 0 ]; then
  emit false true "worktree has changes" "$head" "$state_git_head" true 0
  exit 0
fi

# --- committed changes since last state ---
commits_since=0
if git -C "$DIR" cat-file -e "$state_git_head^{commit}" 2>/dev/null; then
  commits_since=$(git -C "$DIR" rev-list --count "$state_git_head..HEAD" 2>/dev/null || printf '0')
fi

if [ "$head" != "$state_git_head" ]; then
  changed=$(git -C "$DIR" diff --name-only "$state_git_head..HEAD" 2>/dev/null || printf '')
  # skip only if there ARE changed paths and EVERY one is under openwiki/
  any=0
  non_wiki=0
  while IFS= read -r p; do
    [ -z "$p" ] && continue
    any=1
    p=${p//\\//}
    if [ "$p" != "$WIKI_DIR" ] && [ "${p#"$WIKI_DIR"/}" = "$p" ]; then
      non_wiki=1
    fi
  done <<EOF
$changed
EOF
  if [ "$any" -eq 0 ] || [ "$non_wiki" -eq 1 ]; then
    emit false true "git head changed" "$head" "$state_git_head" false "$commits_since"
    exit 0
  fi
fi

emit true true "no meaningful changes since last update" "$head" "$state_git_head" false "$commits_since"
exit 0
