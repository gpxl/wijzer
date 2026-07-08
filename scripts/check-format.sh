#!/usr/bin/env bash
# check-format.sh — validates that an openwiki/ directory conforms to the
# wiki-format.md PARITY CONTRACT. This is a read-only validation gate, not a
# feature: it enforces the exact format that references/wiki-format.md already
# mandates (entrypoint filename, H1-first pages, resolving relative links, the
# `## Source map` / `Git evidence:` shape, the init page ceiling). The init and
# update skills run it before writing state so a wiki that has drifted from the
# contract never gets committed.
#
# Emits a single JSON object on stdout:
#   {"ok":bool,"pages":int,"problems":[...strings],"warnings":[...strings]}
# `ok` is true iff `problems` is empty. `pages` counts .md files under openwiki/
# (excluding .last-update.json — it is json, not md — and _plan.md if present).
# Exit codes: 0 = evaluated, 2 = precondition missing (no openwiki/ dir).
#
# Dependency-free: bash 3.2 + coreutils. No associative arrays, no ${var,,}.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=scripts/lib/json.sh
. "$SCRIPT_DIR/lib/json.sh"

DIR="."
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR=$2; shift 2 ;;
    *) printf 'check-format.sh: unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

WIKI="$DIR/openwiki"

if [ ! -d "$WIKI" ]; then
  printf 'check-format.sh: %s/openwiki does not exist\n' "$DIR" >&2
  exit 2
fi

# Accumulators. Newline-delimited so bash 3.2 can iterate them without arrays.
PROBLEMS=""
WARNINGS=""
add_problem() { PROBLEMS="${PROBLEMS}$1"$'\n'; }
add_warning() { WARNINGS="${WARNINGS}$1"$'\n'; }

# --- Enumerate documentation pages (.md), excluding _plan.md. -----------------
# .last-update.json is json, not md, so a plain *.md filter already excludes it.
# Sorted for deterministic problem ordering. Relative paths inside openwiki/.
PAGES=$(
  cd "$WIKI" || exit 1
  find . -type f -name '*.md' | LC_ALL=C sort | while IFS= read -r f; do
    rel=${f#./}
    [ "$rel" = "_plan.md" ] && continue
    printf '%s\n' "$rel"
  done
)

pages_count=0
if [ -n "$PAGES" ]; then
  pages_count=$(printf '%s\n' "$PAGES" | grep -c '' || true)
fi

# --- Problem 1: quickstart.md must exist. --------------------------------------
if [ ! -f "$WIKI/quickstart.md" ]; then
  add_problem "openwiki/quickstart.md is missing (the wiki entrypoint)"
fi

# --- Problem 5: the temporary plan must have been removed by init. -------------
if [ -f "$WIKI/_plan.md" ]; then
  add_problem "openwiki/_plan.md is still present (init must delete the plan)"
fi

# --- Per-page checks. ----------------------------------------------------------
# Iterate the enumerated pages. Each check appends repo-relative page context so
# a listed problem points the skill at the file to fix.
if [ -n "$PAGES" ]; then
  while IFS= read -r rel; do
    [ -z "$rel" ] && continue
    file="$WIKI/$rel"

    # Problem 2: first line must be a level-1 ATX heading ("# ..."). A leading
    # "---" (YAML frontmatter) or any non-"# " first line is a parity violation.
    first_line=$(awk 'NR==1{print; exit}' "$file")
    case "$first_line" in
      "# "*) : ;; # ok — level-1 heading
      "---")
        add_problem "openwiki/$rel starts with '---' (YAML frontmatter is forbidden; first line must be a '# ' heading)"
        ;;
      *)
        add_problem "openwiki/$rel first line is not a '# ' level-1 heading"
        ;;
    esac

    # Problem 3: relative Markdown links to same-wiki targets must resolve.
    # Extract link targets of the form ](target). Ignore external/anchor links.
    # A target that is a wiki-relative path (./x, x.md, sub/x.md) resolves
    # against openwiki/; a repo-relative target (../src/...) resolves against
    # the repo dir. Only flag a missing target.
    targets=$(grep -oE '\]\([^)]+\)' "$file" 2>/dev/null | sed -e 's/^](//' -e 's/)$//' || true)
    if [ -n "$targets" ]; then
      while IFS= read -r target; do
        [ -z "$target" ] && continue
        # Strip a trailing #anchor and any surrounding whitespace.
        target=${target%%#*}
        target=${target%"${target##*[![:space:]]}"}
        target=${target#"${target%%[![:space:]]*}"}
        [ -z "$target" ] && continue
        case "$target" in
          http://*|https://*|mailto:*|//*) continue ;;   # external
          /*) continue ;;                                 # absolute path — out of scope
          *:*) continue ;;                                # other scheme (e.g. ftp:)
        esac
        # Only consider Markdown-ish same-wiki targets: those ending in .md or
        # beginning with ./ or ../ . Anything else (e.g. an image, a bare
        # fragment already stripped) we leave alone to stay conservative.
        case "$target" in
          *.md|./*|../*) : ;;
          *) continue ;;
        esac
        # Resolve against the page's own directory using real filesystem
        # semantics, so `./x.md` and `../topic/y.md` (same-wiki) resolve inside
        # openwiki/, while a link that escapes with enough `../` to reach repo
        # files resolves against the repo. `[ -e ]` follows `..` for us; a
        # missing target (broken same-wiki link, or a repo file that moved) is
        # the only thing we flag.
        page_dir=$(dirname "$file")
        resolved="$page_dir/$target"
        if [ ! -e "$resolved" ]; then
          add_problem "openwiki/$rel has a broken relative link: $target"
        fi
      done <<EOF
$targets
EOF
    fi

    # Problem 4: source-map / git-evidence shape.
    # 4a. A mis-cased heading ("## Source Map") is a problem — the literal is
    #     "## Source map" (capital S, lowercase m).
    if grep -qE '^##[[:space:]]+[Ss]ource[[:space:]]+[Mm]ap[[:space:]]*$' "$file"; then
      if ! grep -qE '^##[[:space:]]+Source map[[:space:]]*$' "$file"; then
        add_problem "openwiki/$rel has a mis-cased source-map heading (must be exactly '## Source map')"
      fi
    fi

    # 4b/4c. Within the '## Source map' section, validate Git evidence bullets.
    # We scan the section: from a line matching the exact heading up to the next
    # '## ' heading or EOF. Collect its bullet lines to check evidence position.
    # Capture the scan result in a variable — never write into openwiki/ (a
    # git-tracked dir); a leftover temp file would dirty the worktree and trip
    # check-noop. Emits "notlast" and/or "malformed" lines for this page.
    smverdict=$(awk '
      BEGIN { insec=0 }
      /^##[[:space:]]+Source map[[:space:]]*$/ { insec=1; next }
      insec && /^##[[:space:]]/ { insec=0 }
      insec {
        # Track bullets (lines starting with "- ").
        if ($0 ~ /^-[[:space:]]/) {
          bullets = bullets $0 "\n"
        }
      }
      END {
        n = split(bullets, arr, "\n")
        # arr may have a trailing empty element from the final newline.
        # Find real bullet count.
        cnt = 0
        for (i = 1; i <= n; i++) if (length(arr[i]) > 0) { cnt++; last[cnt] = arr[i]; }
        for (i = 1; i <= cnt; i++) {
          line = last[i]
          if (line ~ /Git evidence:/) {
            # Must be the LAST bullet.
            if (i != cnt) { print "notlast"; }
            # Must match exactly: "- Git evidence: commits `<7hex>`" then zero or
            # more ", `<7hex>`". Backticks + 7-char lowercase hex required.
            if (line !~ /^-[[:space:]]Git evidence: commits `[0-9a-f]{7}`([[:space:]]*,[[:space:]]*`[0-9a-f]{7}`)*[[:space:]]*$/) {
              print "malformed";
            }
          }
        }
      }
    ' "$file" 2>/dev/null || true)
    case "$smverdict" in
      *malformed*)
        add_problem "openwiki/$rel has a malformed 'Git evidence:' bullet (must be \`- Git evidence: commits \`<7-hex>\`\` with 7-char backticked hashes)"
        ;;
    esac
    case "$smverdict" in
      *notlast*)
        add_problem "openwiki/$rel has a 'Git evidence:' bullet that is not the last bullet of its source map"
        ;;
    esac

    # Warning: a non-quickstart .md page sitting at the openwiki/ root instead of
    # a topic subdirectory.
    case "$rel" in
      */*) : ;; # in a subdirectory — good
      quickstart.md) : ;; # the entrypoint belongs at root
      *) add_warning "openwiki/$rel sits at the wiki root; section pages belong in a topic subdirectory" ;;
    esac
  done <<EOF
$PAGES
EOF
fi

# --- Problem 6: with 2+ pages, quickstart needs the linking headings. ----------
if [ "$pages_count" -ge 2 ] && [ -f "$WIKI/quickstart.md" ]; then
  if ! grep -qE '^##[[:space:]]+Start here[[:space:]]*$' "$WIKI/quickstart.md"; then
    add_problem "openwiki/quickstart.md is missing the '## Start here' heading (required once 2+ pages exist)"
  fi
  if ! grep -qE '^##[[:space:]]+Documentation map[[:space:]]*$' "$WIKI/quickstart.md"; then
    add_problem "openwiki/quickstart.md is missing the '## Documentation map' heading (required once 2+ pages exist)"
  fi
fi

# --- Warning: soft init ceiling of 8 pages. ------------------------------------
if [ "$pages_count" -gt 8 ]; then
  add_warning "openwiki/ has $pages_count pages (soft init ceiling is 8; consider merging thin pages)"
fi

# --- Emit. ---------------------------------------------------------------------
# Build JSON arrays from the newline-delimited accumulators.
json_array() {
  # reads newline-delimited items on stdin -> [json_str,json_str,...]
  local out="" first=1 item
  while IFS= read -r item; do
    [ -z "$item" ] && continue
    if [ "$first" -eq 1 ]; then
      out="$(json_str "$item")"
      first=0
    else
      out="$out,$(json_str "$item")"
    fi
  done
  printf '[%s]' "$out"
}

problems_json=$(printf '%s' "$PROBLEMS" | json_array)
warnings_json=$(printf '%s' "$WARNINGS" | json_array)

ok=true
[ -n "$PROBLEMS" ] && ok=false

printf '{"ok":%s,"pages":%s,"problems":%s,"warnings":%s}\n' \
  "$ok" "$pages_count" "$problems_json" "$warnings_json"
exit 0
