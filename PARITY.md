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
| plain-MD pages, no frontmatter, source-map at page end, ≤8 pages on init | `references/wiki-format.md` + `scripts/check-format.sh` gate in init/update | `tests/check-format.test.ts` + golden run vs upstream `openwiki/` |
| `.last-update.json` = {updatedAt, command, gitHead?, model} | `scripts/write-state.sh` | `tests/state.test.ts` (CLI contract) + `tests/parity-crossvalidate.test.ts` (real-function interchange) |
| no-op: (no msg AND HEAD==state) OR only `openwiki/` changed; force when dirty | `scripts/check-noop.sh` (ports `getUpdateNoopStatus` + `shouldCheckUpdateNoop`) | `tests/parity-crossvalidate.test.ts` runs bash vs the vendored real functions; `vendor/openwiki/test/update-noop.test.ts` runs verbatim against the vendored source |
| surgical edits: ≤1–2 pages when <5 files changed | `references/disciplines.md` + `scripts/diff-summary.sh` | Phase-3 scenario |
| SHA-256 snapshot; write state only if content changed | `scripts/snapshot.sh` (`dir:`/`file:` frames match real byte-for-byte) + update-skill gate | `tests/snapshot.test.ts` (envelope) + `tests/parity-crossvalidate.test.ts` (digest equals real) |
| init: inventory → `_plan.md` → generate → delete plan → state | `scripts/inventory.sh` + init skill | golden run |
| run/subagent/planning/git disciplines (`src/agent/prompt.ts`) | `references/disciplines.md` + `references/wiki-format.md` (both **generated** from the vendored `prompt.ts` by `scripts/build-disciplines.mjs`) + `agents/wiki-scout.md` | `tests/build-disciplines.test.ts` — drift-locked: the committed docs must equal a fresh regenerate, so an upstream prompt change fails CI until re-derived |
| idempotent AGENTS.md/CLAUDE.md block | `scripts/inject-pointer.sh` | `tests/inject.test.ts` |
| GH Action: cron 8am → update → PR `openwiki/update` | `examples/github-action.yml` (via anthropics/claude-code-action, subscription OAuth) | Phase-4 live run |

## Watch items

- **State-file parsing seam.** `scripts/check-noop.sh` extracts `gitHead` from
  `openwiki/.last-update.json` with `sed`, not a JSON parser (the scripts are
  dependency-free by design). This is the one place interchangeability depends
  on parsing JSON that *OpenWiki* may have written. Mitigated by
  `tests/parity-crossvalidate.test.ts`, which runs `check-noop.sh` over state
  files the vendored real OpenWiki functions produce; if upstream ever changes
  its serializer (multi-line output, key reordering across lines), re-check this
  seam first during re-validation.

## Re-validation procedure (when parity-watch fires)

1. Re-vendor the pinned spec source: `scripts/vendor-openwiki.sh --sha <new>`.
   The frozen upstream copy lives in **`vendor/openwiki/`** (see its
   `PROVENANCE.md`); the diff of that directory *is* the upstream change to
   review (`test/update-noop.test.ts`, `src/agent/utils.ts`, `src/agent/prompt.ts`,
   `src/constants.ts`, `src/agent/types.ts`).
2. Re-derive the prompt-driven doctrine: `node scripts/build-disciplines.mjs`.
   If `prompt.ts` changed, this rewrites `references/disciplines.md` and
   `references/wiki-format.md`; review the diff (it *is* the discipline change),
   extend the translation table in the script if OpenWiki introduced new
   virtual-filesystem vocabulary (the residual-vocab guard fails loudly on
   anything untranslated), and commit the regenerated docs.
3. Run `npm test` — must be green on macOS + Linux. `tests/parity-crossvalidate.test.ts`
   executes wijzer's bash against the newly-vendored real functions, the vendored
   `test/update-noop.test.ts` runs verbatim, and `tests/build-disciplines.test.ts`
   fails until the derived docs above are re-committed. Any divergence is either a
   new intended distribution-method delta (document it inline) or a bash bug to
   fix. No hand-porting of test cases is required — the spec test *is* the vendored
   test.
4. If the wiki format or a prompt discipline changed, run a golden `init` and
   diff the structure against the new upstream `openwiki/`.
5. Bump the **Upstream validated against** SHA above (it must match
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
