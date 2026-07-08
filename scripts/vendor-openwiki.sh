#!/usr/bin/env bash
# vendor-openwiki.sh — fetch the spec-bearing OpenWiki source files at the
# PARITY.md-pinned commit into vendor/openwiki/, so wijzer can cross-validate its
# bash ports against the real TypeScript (see wj-apo / wj-cuz) without an LLM.
#
# Each source file is pinned by BOTH the commit SHA and its upstream git blob
# SHA: the raw bytes are verified with `git hash-object` before being written, so
# a moved path or a re-tagged commit fails loudly instead of vendoring wrong
# content. Vendored .ts files get an MIT attribution header; the upstream LICENSE
# is copied pristine. PROVENANCE (commit SHA, source URLs, fetch date, upstream
# blob SHAs) and manifest.blobsha (blob SHA of each committed file, for the
# offline drift-lock in tests/vendor-openwiki.test.ts) are regenerated too.
#
# This is a maintenance script (run when bumping the parity pin), not a per-run
# script — it has no user-runtime impact and adds no runtime dependency.
#
# Emits: {"vendored":int,"sha":str,"dir":str}
# Exit 0 = vendored; 2 = precondition missing (no curl/git) or fetch/verify fail.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

# Pinned upstream — keep in lockstep with PARITY.md's "Upstream validated
# against" SHA. tests/vendor-openwiki.test.ts asserts these two never drift apart.
PIN_SHA="23428de0cc0b1b6d3e5d09be413e92a5d6ee451f"
REPO_SLUG="langchain-ai/openwiki"
OUT="$REPO_ROOT/vendor/openwiki"

while [ $# -gt 0 ]; do
  case "$1" in
    --sha) PIN_SHA=$2; shift 2 ;;
    --out) OUT=$2; shift 2 ;;
    *) printf 'vendor-openwiki.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

for tool in curl git; do
  command -v "$tool" >/dev/null 2>&1 || {
    printf 'vendor-openwiki.sh: required tool missing: %s\n' "$tool" >&2
    exit 2
  }
done

RAW_BASE="https://raw.githubusercontent.com/$REPO_SLUG/$PIN_SHA"
BLOB_BASE="https://github.com/$REPO_SLUG/blob/$PIN_SHA"

# Upstream path : vendored relpath : expected upstream git blob SHA.
# The .ts files receive an attribution header; LICENSE is copied verbatim.
FILES="
src/constants.ts:src/constants.ts:187229bce421b1868514a0e767b93b2e45b7c60e
src/agent/types.ts:src/agent/types.ts:dc7869003215041eb5ee5ff0a3e041ad395851c3
src/agent/utils.ts:src/agent/utils.ts:1cf5cc392cb866b2d7e98931401b629934592b82
src/agent/prompt.ts:src/agent/prompt.ts:f7d02d2a34f5bf5276c99b40ac2ed02817846932
test/update-noop.test.ts:test/update-noop.test.ts:e530b1d2ea37e6f6c66d8f893aa4e58bf87fdb9c
LICENSE:LICENSE:14fac913ccf80234b1848540089a3bbcb6e5283d
"

# Fetch date is recorded in UTC; SOURCE_DATE_EPOCH allows a reproducible override.
if [ -n "${SOURCE_DATE_EPOCH:-}" ]; then
  FETCH_DATE=$(date -u -r "$SOURCE_DATE_EPOCH" +%Y-%m-%d 2>/dev/null || date -u +%Y-%m-%d)
else
  FETCH_DATE=$(date -u +%Y-%m-%d)
fi

rm -rf "$OUT"
mkdir -p "$OUT"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

count=0
prov_rows=""
for entry in $FILES; do
  up=${entry%%:*}
  rest=${entry#*:}
  rel=${rest%%:*}
  want=${rest##*:}

  # Retry with backoff — raw.githubusercontent rate-limits (429) rapid fetches.
  attempt=1
  until curl -fsSL "$RAW_BASE/$up" -o "$tmp"; do
    if [ "$attempt" -ge 4 ]; then
      printf 'vendor-openwiki.sh: fetch failed for %s (after %s attempts)\n' \
        "$up" "$attempt" >&2
      exit 2
    fi
    sleep "$attempt"
    attempt=$((attempt + 1))
  done
  got=$(git hash-object "$tmp")
  if [ "$got" != "$want" ]; then
    printf 'vendor-openwiki.sh: blob SHA mismatch for %s\n  want %s\n  got  %s\n' \
      "$up" "$want" "$got" >&2
    printf '  (upstream path moved or pin re-tagged — do not vendor blindly)\n' >&2
    exit 2
  fi

  dest="$OUT/$rel"
  mkdir -p "$(dirname "$dest")"
  case "$rel" in
    *.ts)
      {
        printf '// Vendored from %s @ %s\n' "$REPO_SLUG" "$PIN_SHA"
        printf '// Source: %s (%s/%s)\n' "$up" "$BLOB_BASE" "$up"
        printf '// Upstream license: MIT — see vendor/openwiki/LICENSE.\n'
        printf '// SPDX-License-Identifier: MIT\n'
        printf '// DO NOT EDIT — regenerate via scripts/vendor-openwiki.sh.\n'
        cat "$tmp"
      } > "$dest"
      ;;
    *)
      cp "$tmp" "$dest"
      ;;
  esac

  prov_rows="${prov_rows}| \`${rel}\` | \`${up}\` | \`${want}\` |
"
  count=$((count + 1))
done

# PROVENANCE — human-readable record of what was vendored and from where.
cat > "$OUT/PROVENANCE.md" <<EOF
# Vendored OpenWiki source — provenance

These files are copied verbatim from **[$REPO_SLUG](https://github.com/$REPO_SLUG)**
(MIT) so wijzer can cross-validate its dependency-free bash ports against the real
TypeScript specification. They are **not** part of wijzer's runtime and add no
runtime dependency — Vitest transforms the \`.ts\` on the fly.

- **Pinned commit:** \`$PIN_SHA\`
- **Source:** https://github.com/$REPO_SLUG/tree/$PIN_SHA
- **Fetched (UTC):** $FETCH_DATE
- **Regenerate with:** \`scripts/vendor-openwiki.sh\`

The pinned commit MUST match PARITY.md's "Upstream validated against" SHA;
\`tests/vendor-openwiki.test.ts\` fails if the two drift apart. Each file below was
verified at fetch time against its upstream git blob SHA.

| Vendored path | Upstream path | Upstream blob SHA |
|---|---|---|
$prov_rows
> \`.ts\` files carry an MIT attribution header (so the git blob SHA of the
> committed file differs from the upstream blob SHA above); \`LICENSE\` is verbatim.
> The offline drift-lock in \`manifest.blobsha\` records the committed files' own
> blob SHAs.
EOF

# manifest.blobsha — machine-readable blob SHA of every committed vendored file
# (header included), for the offline drift-lock. Excludes PROVENANCE + itself.
: > "$OUT/manifest.blobsha"
while IFS= read -r f; do
  rel=${f#"$OUT"/}
  git hash-object "$f" | {
    read -r sha
    printf '%s  %s\n' "$sha" "$rel"
  }
done < <(find "$OUT" -type f \
  ! -name PROVENANCE.md ! -name manifest.blobsha | LC_ALL=C sort) \
  >> "$OUT/manifest.blobsha"

rel_out=${OUT#"$REPO_ROOT"/}
printf '{"vendored":%s,"sha":%s,"dir":%s}\n' \
  "$count" "$(json_str "$PIN_SHA")" "$(json_str "$rel_out")"
