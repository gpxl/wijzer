# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Phase 1 — deterministic core.** Plugin scaffold (`.claude-plugin/`), the six
  bash scripts that own all deterministic bookkeeping (`check-noop`, `snapshot`,
  `write-state`, `diff-summary`, `inventory`, `inject-pointer`), and a Vitest
  suite that exercises them against real temporary git repos. `tests/noop.test.ts`
  is a case-for-case port of OpenWiki's `test/update-noop.test.ts` (the executable
  parity spec). CI runs shellcheck + tests on macOS and Linux.
- `PARITY.md` pinning the validated upstream OpenWiki commit and the mapping table.
- **Phase 2 — init skill.** `/wijzer:init [focus]` (`skills/init/SKILL.md`) that
  runs the deterministic inventory, optionally fans out read-only `wiki-scout`
  subagents (`agents/wiki-scout.md`), plans via `openwiki/_plan.md`, writes the
  wiki, injects the `AGENTS.md`/`CLAUDE.md` pointer, and records state. The
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
