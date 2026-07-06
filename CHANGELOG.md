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

<!-- Phases 2–5 (skills, update/churn, integration surface, release) land here. -->
