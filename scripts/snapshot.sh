#!/usr/bin/env bash
# snapshot.sh — deterministic SHA-256 digest over the openwiki/ content, EXCLUDING
# the run-metadata file (.last-update.json). Ports OpenWiki's
# createOpenWikiContentSnapshot: the update skill hashes before/after so state is
# written only when documentation content actually changed (PR-churn prevention).
#
# Emits: {"digest":str,"files":int,"present":bool}
# Exit 0 always (missing wiki dir yields a sentinel digest).
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

DIR="."
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=$2; shift 2 ;;
    *) printf 'snapshot.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

WIKI="$DIR/openwiki"
STATE_BASENAME=".last-update.json"

if [ ! -d "$WIKI" ]; then
  digest=$(printf 'missing' | sha256_stream)
  printf '{"digest":%s,"files":0,"present":false}\n' "$(json_str "$digest")"
  exit 0
fi

# Deterministic: enumerate, sort by byte order, frame each file as
# "file:<relpath>\0<bytes>\0", stream into one digest. Excludes the top-level
# state file only (matches OpenWiki's relativePath === basename check).
digest=$(
  cd "$WIKI" || exit 1
  find . -type f | LC_ALL=C sort | while IFS= read -r f; do
    rel=${f#./}
    [ "$rel" = "$STATE_BASENAME" ] && continue
    printf 'file:%s\0' "$rel"
    cat "$f"
    printf '\0'
  done | sha256_stream
)

files=$(cd "$WIKI" && find . -type f | awk -v s="./$STATE_BASENAME" '$0!=s{c++} END{print c+0}')
[ -z "$files" ] && files=0

printf '{"digest":%s,"files":%s,"present":true}\n' "$(json_str "$digest")" "$files"
