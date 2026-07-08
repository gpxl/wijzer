# wijzer

A **Claude Code plugin** that generates and maintains an OpenWiki-format agent
wiki for a repository, refreshed from git diffs — powered by the user's Claude
subscription (no API keys). Format + behavior parity with
[langchain-ai/openwiki](https://github.com/langchain-ai/openwiki); see
[PARITY.md](PARITY.md).

## Architecture

Deterministic bookkeeping lives in **`scripts/`** (dependency-free bash: git +
coreutils); each script emits one JSON object on stdout (exit 0 = ran, 2 =
precondition missing). Model judgment lives in **`skills/`** (`/wijzer:init`,
`:update`, `:ask`) and **`agents/`** (`wiki-scout`, read-only fan-out). Shared
doctrine is in **`references/`** — and `disciplines.md` + `wiki-format.md` are
**generated**, not hand-written: `scripts/build-disciplines.mjs` (dev/CI-only
Node, the one exception to the dependency-free-bash rule; never run by users)
derives them from the vendored OpenWiki prompt via a documented tool-vocabulary
translation, drift-locked by `tests/build-disciplines.test.ts`. Edit the
generator and re-run it, never the generated files. The format side of parity is gated
deterministically too: init/update finish by running `scripts/check-format.sh`
over `openwiki/` and must fix reported problems before recording state. The scripts are unit-tested against real temp
git repos in **`tests/`** (Vitest); `tests/noop.test.ts` is a case-for-case port
of OpenWiki's `test/update-noop.test.ts` — the executable parity spec.

Interchangeability with OpenWiki means the wiki dir stays `openwiki/` and the
state file stays `openwiki/.last-update.json` with the exact
`{updatedAt, command, gitHead?, model}` schema — do not rename these.

## Commands

| Action | Command |
|--------|---------|
| Test | `npm test` (Vitest; runs the scripts against temp git repos) |
| Lint | `npm run lint` (`shellcheck scripts/*.sh scripts/lib/*.sh`) |

## Agent Config

| Key | Value |
|-----|-------|
| test_cmd | `npm test` |
| build_cmd | (none — no compile step) |
| lint_cmd | `npm run lint` (shellcheck; warnings fail CI) |
| quality_gate_pattern | `scripts/.*\.sh` |
| test_pattern | `scripts/<name>.sh` → `tests/<name>.test.ts` |
| branch_pattern | `claude/<description>` (off `origin/main`) |
| pr_merge_strategy | squash + delete branch |
| pr_automerge | on green — pr-monitor merges feature PRs automatically once all CI checks pass (squash + delete branch); no human approval gate |

## Conventions

- Every new `scripts/*.sh` gets a co-located `tests/<name>.test.ts` exercising it
  against a real temp git repo (behavioral, not implementation).
- Bash: `set -euo pipefail`; guard pipelines whose `grep` may legitimately match
  nothing with `|| true` (pipefail + set -e will otherwise abort on empty match);
  prefer `awk 'NR<=n'` over `head -n` inside pipelines to avoid SIGPIPE aborts.
- Keep the scripts modelless and portable (macOS bash 3.2 + GNU); the macOS/Linux
  split (`shasum` vs `sha256sum`) is bridged in `scripts/lib/json.sh`.
- When OpenWiki drifts, follow the re-validation procedure in PARITY.md and bump
  the pinned SHA — never silently claim parity.
