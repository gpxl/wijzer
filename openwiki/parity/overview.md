# Parity model

wijzer's whole reason to exist is running OpenWiki's documentation behavior on a
Claude subscription instead of a metered API. That only matters if the output is
**interchangeable** with OpenWiki's. This page explains how wijzer achieves parity
and, crucially, how it *proves* parity against real upstream code rather than
assuming it. The living contract is [PARITY.md](../../PARITY.md).

## What parity covers

Interchangeable: the `openwiki/` layout and Markdown page format, the
`openwiki/.last-update.json` state schema, the update no-op / churn-prevention
algorithm, and the AGENTS.md/CLAUDE.md pointer block. Out of scope: OpenWiki's
provider/credential machinery (wijzer's runtime is Claude Code), its CLI flag
surface, and byte-identical page prose.

## Vendored source as the oracle

wijzer cannot run the OpenWiki *agent* (that needs an API key — the whole reason
wijzer exists). It doesn't need to: OpenWiki's deterministic bookkeeping is pure
git + filesystem logic with no LLM in the loop. `scripts/vendor-openwiki.sh`
freezes that source at a pinned SHA into `vendor/openwiki/` (with a blob-SHA
manifest and `PROVENANCE.md`), and the tests **execute it directly**:

- `tests/parity-crossvalidate.test.ts` runs wijzer's bash and the vendored real
  functions over the same temp repos and asserts they agree.
- `vendor/openwiki/test/update-noop.test.ts` runs **verbatim** against the
  vendored source — the upstream spec test is the parity spec, no hand-porting.
- `tests/vendor-openwiki.test.ts` locks every vendored file to its manifest blob
  SHA, so any drift is loud.

## Generated doctrine

The run / subagent / planning / git disciplines and the wiki output format are
not hand-written — they are **derived from the vendored prompt**.
`scripts/build-disciplines.mjs` (dev/CI-only Node) text-parses
`vendor/openwiki/src/agent/prompt.ts`, applies a documented tool-vocabulary
translation (OpenWiki's DeepAgents virtual filesystem → Claude Code
`Read`/`Grep`/`Glob`/`Write`/`Edit`/`Bash`, the `task` tool → `Task` +
`wiki-scout`), and writes `references/disciplines.md` + `references/wiki-format.md`.
The exact `## OpenWiki` pointer block is preserved verbatim (fenced blocks are
exempt from translation). `tests/build-disciplines.test.ts` drift-locks the
committed docs to a fresh regenerate, so an upstream prompt change fails CI until
a human re-derives and reviews.

## Watching upstream + re-validation

`.github/workflows/parity-watch.yml` compares the vendored spec files against
upstream `main` weekly and opens a tracking issue on drift. The response is the
re-validation procedure in [PARITY.md](../../PARITY.md): re-vendor at the new SHA,
regenerate the docs, run `npm test` (cross-validation re-proves parity), then bump
the pin and note it in the changelog. wijzer never claims parity it hasn't
re-proven.

## Source map

- `PARITY.md`
- `scripts/vendor-openwiki.sh`
- `scripts/build-disciplines.mjs`
- `vendor/openwiki/PROVENANCE.md`
- `tests/parity-crossvalidate.test.ts`
- `tests/vendor-openwiki.test.ts`
- `.github/workflows/parity-watch.yml`
- Git evidence: commits `f1cc4ff`, `2ff0c3a`, `f34a82d`
