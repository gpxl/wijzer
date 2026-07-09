# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Phase 1 — deterministic core.** Plugin scaffold (`.claude-plugin/`), the
  bash scripts that own the deterministic no-op / snapshot / state bookkeeping
  (`check-noop`, `snapshot`, `write-state`), and a Vitest suite that exercises
  them against real temporary git repos. The executable parity spec is OpenWiki's
  own `test/update-noop.test.ts`, run verbatim from the vendored source, plus
  `tests/parity-crossvalidate.test.ts` (wijzer's bash vs the real functions). CI
  runs shellcheck + tests on macOS and Linux. (Phase 1 also shipped `inventory`,
  `inject-pointer`, and `diff-summary`; P2D removed them — see Changed below.)
- `PARITY.md` pinning the validated upstream OpenWiki commit and the mapping table.
- **Phase 2 — init skill.** `/wijzer:init [focus]` (`skills/init/SKILL.md`) that
  discovers the repository, optionally fans out read-only `wiki-scout`
  subagents (`agents/wiki-scout.md`), plans via `openwiki/_plan.md`, writes the
  wiki, adds the `AGENTS.md`/`CLAUDE.md` pointer section, and records state. The
  parity contract is captured in `references/wiki-format.md` (page format, source
  maps, ≤8-page ceiling) and `references/disciplines.md` (run / subagent /
  planning / git / surgical-edit disciplines).
- **Phase 3 — update skill + churn prevention.** `/wijzer:update [--dry-run]
  [instruction]` (`skills/update/SKILL.md`) with the two-gate no-op flow
  (preflight `check-noop` + before/after content snapshot) so unchanged runs
  write nothing. `references/state-schema.md` documents the interchangeable
  `.last-update.json` schema.
- **Phase 4 — integration surface.** `/wijzer:ask <question>`
  (`skills/ask/SKILL.md`, structurally read-only) with source-map citations;
  `examples/github-action.yml` (scheduled subscription-OAuth refresh → PR) and
  `examples/headless.md` (`claude -p` recipes); and
  `.github/workflows/parity-watch.yml`, which opens a tracking issue when
  upstream OpenWiki's spec-bearing files drift from the pinned commit.
- A `tests/plugin-structure.test.ts` suite asserting the plugin hangs together:
  skill frontmatter, read-only guarantees for `ask`/`wiki-scout`, that every
  bundled path a skill references exists, and that `parity-watch` pins the same
  SHA as `PARITY.md`.
- **Generated doctrine (drift-locked to the real prompt).**
  `scripts/build-disciplines.mjs` (dev/CI only — never run by users) derives
  `references/disciplines.md` and `references/wiki-format.md` from the vendored
  OpenWiki system prompt (`vendor/openwiki/src/agent/prompt.ts`) via a documented
  tool-vocabulary translation (DeepAgents virtual filesystem → Claude Code
  `Read`/`Grep`/`Glob`/`Write`/`Edit`/`Bash`, the `task` tool → `Task` +
  `wiki-scout`, `/openwiki/…` → `openwiki/…`); OpenWiki's out-of-scope CLI-flag
  section is dropped. `tests/build-disciplines.test.ts` drift-locks the committed
  docs to a fresh regenerate, so an upstream prompt change fails CI until
  re-derived — replacing the former manual "prompt review" parity check. The
  reverse-engineered output-format literals (`## Source map`, the `Git evidence:`
  7-char-hash bullet, the no-frontmatter and quickstart-heading rules) are carried
  as a labelled generator constant, since they come from OpenWiki's rendered
  output rather than its prompt. `references/state-schema.md` stays hand-authored
  (it documents wijzer-only serialization facts) but its field set is now locked
  to the vendored `UpdateMetadata` type by the same test.

### Changed

- **P2D — prompt-driven skills (parity-first).** Removed the three bash scripts
  that had no OpenWiki counterpart and were wijzer value-adds: `inventory.sh`
  (repo inventory), `inject-pointer.sh` (marker-block writer), and
  `diff-summary.sh` (bespoke JSON diff), plus their tests. Discovery, git
  inspection, and the `AGENTS.md`/`CLAUDE.md` pointer are now **prompt-driven**,
  matching OpenWiki's own behavior:
  - `/wijzer:init` and `/wijzer:update` (`skills/init`, `skills/update`) are thin
    wrappers: they follow the generated run/git disciplines directly and call
    only the exact-semantics bookkeeping scripts (`check-noop`, `snapshot`,
    `write-state`, `check-format`). The update skill reads the baseline from
    `openwiki/.last-update.json` and runs the same `git status`/`log <range>`/`diff`
    commands and the same `gitHead` → `updatedAt` → recent-history fallback as
    OpenWiki's `createGitSummary`.
  - The pointer is written by the agent using OpenWiki's **exact `## OpenWiki`
    block**, now preserved byte-for-byte in `references/disciplines.md` (fenced
    literals are exempt from vocabulary translation and the residual-vocab guard).
    This reverses P2C's inject-pointer.sh adaptation.
  - `agents/wiki-scout.md` is aligned to the generated subagent discipline.
- **P2E — parity reconciliation.** Squared the docs and tests with the vendored-
  real-code reality: `PARITY.md`'s verification column now cites the actual
  verifiers (`tests/parity-crossvalidate.test.ts`, the verbatim vendored
  `update-noop.test.ts`, `tests/build-disciplines.test.ts` drift-lock,
  `tests/check-format.test.ts`) instead of aspirational "Phase N" runs.
  `.github/workflows/parity-watch.yml` now watches the full vendored spec set
  (adds `src/constants.ts` + `src/agent/types.ts`), drops the stale
  `tests/noop.test.ts` mapping, and drives the re-vendor → regenerate → `npm test`
  flow on a SHA bump. Trimmed the two parity-*restatement* assertions from
  `tests/plugin-structure.test.ts` (per the parity-first principle: the ≤8-page
  and <5-files→1–2-pages numbers are pinned in `tests/build-disciplines.test.ts`
  against drift-locked docs, and `## Source map` / `Git evidence:` are enforced in
  `tests/check-format.test.ts`). `README.md` now states Node is a dev/CI-only
  dependency — the plugin needs no `node` at user runtime.
