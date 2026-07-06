#!/usr/bin/env bash
# write-state.sh — atomically writes openwiki/.last-update.json. Schema is
# byte-compatible with OpenWiki's UpdateMetadata so a repo stays interchangeable
# between the two tools: {updatedAt, command, gitHead?, model}.
#
# Emits: {"written":bool,"path":str,"command":str,"gitHead":str,"model":str}
# Exit 0 on success, 2 on usage error.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

DIR="."
COMMAND=""
MODEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=$2; shift 2 ;;
    --command) COMMAND=$2; shift 2 ;;
    --model) MODEL=$2; shift 2 ;;
    *) printf 'write-state.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

case "$COMMAND" in
  init|update) ;;
  *) printf 'write-state.sh: --command must be init or update\n' >&2; exit 2 ;;
esac

# Validate the model id against OpenWiki's isValidModelId charset; fall back to a
# stable provenance literal when the caller cannot report its own model.
model_ok=0
if [ -n "$MODEL" ] && [ "${#MODEL}" -le 120 ] && \
   printf '%s' "$MODEL" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._:/+-]*$' && \
   ! printf '%s' "$MODEL" | grep -q '://'; then
  model_ok=1
fi
[ "$model_ok" -eq 1 ] || MODEL="claude-code"

updated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
git_head=$(git -C "$DIR" rev-parse HEAD 2>/dev/null || printf '')

WIKI="$DIR/openwiki"
STATE_FILE="$WIKI/.last-update.json"
mkdir -p "$WIKI"

# Build the JSON body. gitHead is omitted entirely when unknown (parity with
# JSON.stringify dropping an undefined field).
tmp="$STATE_FILE.tmp.$$"
{
  printf '{\n'
  printf '  "updatedAt": %s,\n' "$(json_str "$updated_at")"
  printf '  "command": %s,\n' "$(json_str "$COMMAND")"
  if [ -n "$git_head" ]; then
    printf '  "gitHead": %s,\n' "$(json_str "$git_head")"
  fi
  printf '  "model": %s\n' "$(json_str "$MODEL")"
  printf '}\n'
} > "$tmp"
mv "$tmp" "$STATE_FILE"

printf '{"written":true,"path":"openwiki/.last-update.json","command":%s,"gitHead":%s,"model":%s}\n' \
  "$(json_str "$COMMAND")" "$(json_str "$git_head")" "$(json_str "$MODEL")"
