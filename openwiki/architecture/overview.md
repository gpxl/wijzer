# Architecture overview

wijzer separates **deterministic bookkeeping** from **model judgment**. Anything
with exact semantics that must match OpenWiki byte-for-byte is a dependency-free
bash script; anything requiring understanding of a codebase is prompt-driven and
done by the model. This page maps the directories and the scripts.

## The split

- **`scripts/`** — dependency-free bash (git + coreutils). Each script owns one
  piece of exact-semantics bookkeeping and prints a single JSON object on stdout
  (exit 0 = ran, 2 = precondition missing, e.g. not a git repo).
- **`skills/` + `agents/`** — model judgment. The skills drive discovery, git
  inspection, page authoring, and the pointer block; they *call* the scripts for
  bookkeeping but never re-implement it.
- **`references/`** — the doctrine the skills obey. `disciplines.md` and
  `wiki-format.md` are **generated** from the vendored OpenWiki prompt (see
  [Parity](../parity/overview.md)); `state-schema.md` is hand-written.
- **`vendor/openwiki/`** — the pinned upstream OpenWiki source used as the parity
  oracle (executed directly by the tests).

## The bookkeeping scripts

Four scripts carry exact OpenWiki semantics and are cross-validated against the
vendored real functions:

- **`check-noop.sh`** — decides whether a `/wijzer:update` run is a no-op (ports
  OpenWiki's `getUpdateNoopStatus` + `shouldCheckUpdateNoop`). Emits `noop`,
  `reason`, `gitHead`, `stateGitHead`, `dirty`, `commitsSince`. A non-empty user
  message short-circuits to force a run.
- **`snapshot.sh`** — a SHA-256 content snapshot of `openwiki/` (excluding the
  state file), so the update skill can tell whether its edits changed anything
  and skip churn. Mirrors `createOpenWikiContentSnapshot` byte-for-byte.
- **`write-state.sh`** — writes `openwiki/.last-update.json` (`{updatedAt,
  command, gitHead?, model}`), the interchangeable run-metadata file. Validates
  the model id and falls back to the `claude-code` literal.
- **`check-format.sh`** — the format-parity gate: verifies a generated wiki obeys
  `references/wiki-format.md` (no YAML frontmatter, `## Source map` shape, the
  `Git evidence:` bullet, quickstart linking headings) before state is recorded.

`scripts/lib/json.sh` provides shared JSON-string escaping and bridges the
macOS/Linux `shasum` vs `sha256sum` split. `scripts/vendor-openwiki.sh` re-vendors
the upstream source at a pinned SHA; `scripts/build-disciplines.mjs` is the
dev/CI-only doc generator (the one exception to the dependency-free-bash rule).

## Conventions

- Bash: `set -euo pipefail`; guard `grep` pipelines that may legitimately match
  nothing with `|| true`; prefer `awk 'NR<=n'` over `head -n` inside pipelines to
  avoid SIGPIPE aborts. Keep scripts portable (macOS bash 3.2 + GNU).
- Every `scripts/<name>.sh` has a co-located `tests/<name>.test.ts` exercising it
  against a real temp git repo (behavioral, not implementation).

## Tests

The suite (Vitest) runs the scripts against real temporary git repos and runs the
vendored OpenWiki code directly as the parity oracle. Notable files:
`tests/parity-crossvalidate.test.ts` (bash vs the real functions),
`tests/vendor-openwiki.test.ts` (vendor drift-lock + the verbatim upstream
`update-noop.test.ts`), `tests/build-disciplines.test.ts` (generated-doc
drift-lock + guard error paths), and `tests/check-format.test.ts`,
`tests/snapshot.test.ts`, `tests/state.test.ts`, `tests/plugin-structure.test.ts`.

## Source map

- `scripts/check-noop.sh`
- `scripts/snapshot.sh`
- `scripts/write-state.sh`
- `scripts/check-format.sh`
- `scripts/lib/json.sh`
- `CLAUDE.md`
- Git evidence: commits `8536c2a`, `511f237`
