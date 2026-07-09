# Skills & agent

wijzer exposes three user-invoked skills and one read-only subagent. All are
**prompt-driven**: they follow the generated disciplines
([disciplines.md](../../references/disciplines.md)) and call the deterministic
scripts only for exact-semantics bookkeeping. None re-implements git or format
logic the scripts already own.

## `/wijzer:init [focus]`

Generates a fresh wiki from scratch. The model discovers the repo the cheap way
(run discipline — tree, manifests, entrypoints, a representative file per domain;
never reading everything), optionally fans out `wiki-scout` subagents, writes a
temporary `openwiki/_plan.md`, then authors `quickstart.md` first and the linked
section pages (≤8 on init). It finishes by running `check-format.sh` (fixing any
reported problems), writing the exact `## OpenWiki` pointer into the top-level
`AGENTS.md` / `CLAUDE.md`, and recording state with `write-state.sh`. Discovery
and the pointer are done by the model; there is no bash inventory or injector
step (OpenWiki has neither). See `skills/init/SKILL.md`.

## `/wijzer:update [--dry-run] [instruction]`

Refreshes the wiki surgically from what changed. It starts with a `check-noop.sh`
preflight (stop cleanly when nothing meaningful changed), then scopes git
inspection from `openwiki/.last-update.json` using OpenWiki's exact `gitHead` →
`updatedAt` → recent-history fallback (mirroring `createGitSummary`). A
before/after `snapshot.sh` digest prevents churn — if edits net no content change,
state is left untouched so scheduled runs don't open empty PRs. `--dry-run`
reports what would change and writes nothing. See `skills/update/SKILL.md`.

## `/wijzer:ask <question>`

Answers a question from the generated wiki and never modifies it — structurally
read-only (its `allowed-tools` grant only `Read`/`Grep`/`Glob`). It starts at
`openwiki/quickstart.md`, follows the relevant links, and cites the pages and
source maps it drew on. See `skills/ask/SKILL.md`.

## `wiki-scout` subagent

The concrete form of the subagent discipline: a read-only discovery scout the
init/update skills fan out (1–2 by default, 3–4 only for small/independent
domains) with one narrow brief. It inspects and summarizes — source paths, git
evidence, open questions — and never writes; the main agent synthesizes every
page. See `agents/wiki-scout.md`.

## Source map

- `skills/init/SKILL.md`
- `skills/update/SKILL.md`
- `skills/ask/SKILL.md`
- `agents/wiki-scout.md`
- `references/disciplines.md`
