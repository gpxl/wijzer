# Parity with OpenWiki

wijzer targets **format + behavior parity** with
[langchain-ai/openwiki](https://github.com/langchain-ai/openwiki) (MIT) so a
repository's wiki is interchangeable between the two tools. This document is the
living record of what that means and how it is verified.

- **Upstream validated against:** commit
  `23428de0cc0b1b6d3e5d09be413e92a5d6ee451f` (langchain-ai/openwiki, `main`).
- **Parity is versioned, not perpetual.** When OpenWiki changes the spec-bearing
  files, `.github/workflows/parity-watch.yml` opens an issue; we re-validate
  (below) and bump the pin. wijzer never claims parity it hasn't re-proven.

## What parity covers (and doesn't)

| In scope (interchangeable) | Out of scope |
|---|---|
| `openwiki/` output layout + Markdown page format | OpenWiki's provider / credential machinery — N/A: Claude Code is wijzer's runtime, your subscription is the auth |
| `openwiki/.last-update.json` state schema | OpenWiki's Ink TUI / CLI flag surface |
| update no-op + churn-prevention algorithm | Byte-identical page prose |
| AGENTS.md / CLAUDE.md pointer injection | LangSmith tracing |

## Mapping table

| OpenWiki behavior (upstream) | wijzer mechanism | Verified by |
|---|---|---|
| `openwiki --init [msg]` | `/wijzer:init [msg]` skill | golden run (Phase 2) vs their committed `openwiki/` |
| `openwiki --update [msg]` | `/wijzer:update [msg]` skill | `tests/parity-crossvalidate.test.ts` + Phase-3 scenarios |
| chat mode (Q&A, no writes) | `/wijzer:ask` skill | manual: assert zero wiki writes |
| `--print` non-interactive | `claude -p "/wijzer:update"` | headless recipe (Phase 4) |
| plain-MD pages, no frontmatter, source-map at page end, ≤8 pages on init | `references/wiki-format.md` | format checklist vs upstream `openwiki/` |
| `.last-update.json` = {updatedAt, command, gitHead?, model} | `scripts/write-state.sh` | `tests/state.test.ts` (CLI contract) + `tests/parity-crossvalidate.test.ts` (real-function interchange) |
| no-op: (no msg AND HEAD==state) OR only `openwiki/` changed; force when dirty | `scripts/check-noop.sh` (ports `getUpdateNoopStatus` + `shouldCheckUpdateNoop`) | `tests/parity-crossvalidate.test.ts` runs bash vs the vendored real functions; `vendor/openwiki/test/update-noop.test.ts` runs verbatim against the vendored source |
| surgical edits: ≤1–2 pages when <5 files changed | `references/disciplines.md` + `scripts/diff-summary.sh` | Phase-3 scenario |
| SHA-256 snapshot; write state only if content changed | `scripts/snapshot.sh` (`dir:`/`file:` frames match real byte-for-byte) + update-skill gate | `tests/snapshot.test.ts` (envelope) + `tests/parity-crossvalidate.test.ts` (digest equals real) |
| init: inventory → `_plan.md` → generate → delete plan → state | `scripts/inventory.sh` + init skill | golden run |
| run/subagent/planning/git disciplines (`src/agent/prompt.ts`) | `references/disciplines.md` + `agents/wiki-scout.md` | prompt review (this doc) |
| idempotent AGENTS.md/CLAUDE.md block | `scripts/inject-pointer.sh` | `tests/inject.test.ts` |
| GH Action: cron 8am → update → PR `openwiki/update` | `examples/github-action.yml` (via anthropics/claude-code-action, subscription OAuth) | Phase-4 live run |

## Re-validation procedure (when parity-watch fires)

1. Re-vendor the pinned spec source: `scripts/vendor-openwiki.sh --sha <new>`.
   The frozen upstream copy lives in **`vendor/openwiki/`** (see its
   `PROVENANCE.md`); the diff of that directory *is* the upstream change to
   review (`test/update-noop.test.ts`, `src/agent/utils.ts`, `src/agent/prompt.ts`,
   `src/constants.ts`, `src/agent/types.ts`).
2. Run `npm test` — must be green on macOS + Linux. `tests/parity-crossvalidate.test.ts`
   executes wijzer's bash against the newly-vendored real functions, and the
   vendored `test/update-noop.test.ts` runs verbatim. Any divergence is either a
   new intended distribution-method delta (document it inline) or a bash bug to
   fix. No hand-porting of test cases is required — the spec test *is* the vendored
   test.
3. If the wiki format or a prompt discipline changed, run a golden `init` and
   diff the structure against the new upstream `openwiki/`.
4. Bump the **Upstream validated against** SHA above (it must match
   `vendor/openwiki/PROVENANCE.md`, enforced by `tests/vendor-openwiki.test.ts`)
   and note the change in `CHANGELOG.md`.

## Why we can validate without running OpenWiki

wijzer cannot run the OpenWiki *agent* (that drives an LLM, which needs an API
key — the whole reason wijzer exists). It doesn't need to: OpenWiki's
**deterministic bookkeeping** — the no-op algorithm, content snapshot, and state
schema — is pure git + filesystem logic with no LLM in the loop. wijzer vendors
that source at a pinned SHA into `vendor/openwiki/` and **executes it directly**
as the parity oracle: `tests/parity-crossvalidate.test.ts` runs wijzer's bash and
the real TypeScript over the same temp repos and asserts they agree, and the
committed `test/update-noop.test.ts` runs verbatim to prove the vendored copy is
faithful. Parity is re-proven against executing code, not assumed from a
transcription.
