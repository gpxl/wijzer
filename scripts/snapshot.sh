#!/usr/bin/env bash
# snapshot.sh — deterministic SHA-256 digest over the openwiki/ content, EXCLUDING
# the run-metadata file (.last-update.json). Ports OpenWiki's
# createOpenWikiContentSnapshot (src/agent/utils.ts): the update skill hashes
# before/after so state is written only when documentation content actually
# changed (PR-churn prevention).
#
# The frame stream matches the real algorithm byte-for-byte so the digests are
# interchangeable (verified in tests/parity-crossvalidate.test.ts): each
# directory is walked recursively, entries sorted by name, subdirectories framed
# as "dir:<relpath>\0" and files as "file:<relpath>\0<bytes>\0". Only the
# top-level state file is excluded (matches the real relativePath === basename
# check). A missing wiki dir hashes the literal "missing" sentinel.
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

# Include dotfiles in globs and let an empty directory expand to nothing, so the
# walk sees exactly the entries readdir would. Wiki page names never contain
# newlines, so the sort below is safe for the format we target.
shopt -s dotglob nullglob

# walk DIR RELPREFIX -> frame stream on stdout, mirroring addDirectoryToSnapshot.
# Entries are sorted per directory (matches the real localeCompare over the
# common ASCII/kebab-case page names); directories recurse, files carry bytes.
walk() {
  local dir=$1 prefix=$2 name child rel
  local names=()
  local entry
  for entry in "$dir"/*; do
    names+=("${entry##*/}")
  done
  [ ${#names[@]} -eq 0 ] && return 0

  local sorted=()
  while IFS= read -r name; do
    sorted+=("$name")
  done < <(printf '%s\n' "${names[@]}" | LC_ALL=C sort)

  for name in "${sorted[@]}"; do
    child="$dir/$name"
    if [ -z "$prefix" ]; then rel="$name"; else rel="$prefix/$name"; fi
    # The real check is relativePath === basename(state) — so only the top-level
    # state file is skipped; a same-named file inside a subdir is kept.
    [ "$rel" = "$STATE_BASENAME" ] && continue
    if [ -d "$child" ]; then
      printf 'dir:%s\0' "$rel"
      walk "$child" "$rel"
    elif [ -f "$child" ]; then
      # Delta vs real: OpenWiki tolerates files that vanish mid-scan (skips them);
      # here an unreadable file aborts the pipeline rather than being skipped.
      # Immaterial for the git-tracked, readable markdown pages we snapshot.
      printf 'file:%s\0' "$rel"
      cat "$child"
      printf '\0'
    fi
  done
}

digest=$(walk "$WIKI" "" | sha256_stream)

files=$(find "$WIKI" -type f | awk -v s="$WIKI/$STATE_BASENAME" '$0!=s{c++} END{print c+0}')
[ -z "$files" ] && files=0

printf '{"digest":%s,"files":%s,"present":true}\n' "$(json_str "$digest")" "$files"
