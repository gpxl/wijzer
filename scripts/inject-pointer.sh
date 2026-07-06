#!/usr/bin/env bash
# inject-pointer.sh — idempotently appends a marker-delimited block to the repo's
# AGENTS.md / CLAUDE.md instructing coding agents to consult openwiki/ (OpenWiki's
# AGENTS.md/CLAUDE.md integration). Safe to re-run: the block is written at most
# once per file; existing user content is preserved.
#
# Emits: {"results":[{"file":str,"action":"created|appended|unchanged"}]}
# Exit 0 on success, 2 on usage error.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

DIR="."
FILES="AGENTS.md,CLAUDE.md"
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=$2; shift 2 ;;
    --files) FILES=$2; shift 2 ;;
    *) printf 'inject-pointer.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

BEGIN_MARKER="<!-- BEGIN wijzer -->"
END_MARKER="<!-- END wijzer -->"

block() {
  cat <<EOF
$BEGIN_MARKER
## Repository wiki (wijzer)

This repository has a generated, maintained wiki under \`openwiki/\`. When
analyzing or modifying code, consult it for context:

- Read \`openwiki/quickstart.md\` first for an overview and the page map.
- Follow the relevant architecture / subsystem pages before changing that area.
- Each page ends with a source map (files + commits) — cross-reference it, and
  keep the wiki in mind when your change would make a page stale.

Regenerate or refresh with \`/wijzer:init\` and \`/wijzer:update\`.
$END_MARKER
EOF
}

results="["
first=1
IFS=',' read -r -a targets <<EOF
$FILES
EOF

for name in "${targets[@]}"; do
  [ -z "$name" ] && continue
  target="$DIR/$name"
  action="unchanged"
  if [ -f "$target" ]; then
    if grep -qF "$BEGIN_MARKER" "$target"; then
      action="unchanged"
    else
      # append with a separating blank line, preserving existing content
      printf '\n%s\n' "$(block)" >> "$target"
      action="appended"
    fi
  else
    block > "$target"
    action="created"
  fi
  [ "$first" -eq 1 ] || results+=","
  results+="{\"file\":$(json_str "$name"),\"action\":$(json_str "$action")}"
  first=0
done
results+="]"

printf '{"results":%s}\n' "$results"
