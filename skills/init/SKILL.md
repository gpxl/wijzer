---
name: init
description: Generate the wijzer/OpenWiki wiki for this repository from scratch into openwiki/, then add the OpenWiki pointer section to AGENTS.md / CLAUDE.md. Use when the user runs /wijzer:init or asks to create/bootstrap the repository wiki.
argument-hint: [focus]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(git log:*), Bash(git show:*), Bash(git diff:*), Bash(git status:*), Bash(git blame:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git cat-file:*), Bash(git ls-files:*), Bash(git shortlog:*), Bash(rg *), Bash(rm -f openwiki/_plan.md), Read, Grep, Glob, Write, Edit, Task
---

# /wijzer:init — generate the wiki from scratch

Build a fresh `openwiki/` wiki for the current repository. Optional focus:
**`$ARGUMENTS`** — if non-empty, bias discovery and page selection toward that
area (e.g. `auth`, `the billing pipeline`), but still ship a coherent
whole-repo quickstart.

First read the two doctrine files and follow them throughout — they are
generated from OpenWiki's own prompt and carry the parity contract:

- `${CLAUDE_PLUGIN_ROOT}/references/wiki-format.md` — exact output format.
- `${CLAUDE_PLUGIN_ROOT}/references/disciplines.md` — run / subagent / planning /
  git disciplines, the init mode block, and the exact `## OpenWiki` pointer block.

Discovery and the pointer are **prompt-driven** — you do them yourself by
following the disciplines. Only the no-op / snapshot / state / format
bookkeeping is delegated to the bundled scripts; call those, don't re-implement
them. Each prints one JSON object.

## Steps

**1. Discover (cheap, prompt-driven).** Follow the **run discipline**: inspect
the repository tree, package/config manifests, README-style files, entrypoints,
routing files, and schema files, plus a representative file or two per major
domain. Use targeted `Grep`/`Glob` by directory and extension (never `**/*` from
the root); prefer `rg --files` with excludes for `.git`, `node_modules`, `dist`,
`build`, caches, and `openwiki/`. Use `git log`/`git show`/`git blame` on
high-signal files to learn *why* the code exists. Do **not** read the whole tree.
(`git rev-parse` fails outside a git repository — if so, stop and tell the user
`/wijzer:init` must run inside one.)

**2. Fan out (only if warranted).** For a repo with multiple substantial,
independent domains, launch **1–2** `wiki-scout` subagents (the Task tool with
`subagent_type: wiki-scout`) with narrow read-only briefs (e.g. "data model",
"API surface"). Use 3–4 only for a clearly small/medium repo or when the user
asked for depth. Synthesize their notes yourself — they never write.

**3. Plan.** Write `openwiki/_plan.md` listing the intended pages, the source
evidence for each, and open questions. This is temporary.

**4. Generate.** Write `openwiki/quickstart.md` **first** (overview + `## Start
here` + `## Documentation map` linking every section), then the linked section
pages under topic subdirectories. Respect the format: plain Markdown, no
frontmatter, H1 first line, optional `## Source map` with a trailing
`` Git evidence: commits `abc1234` `` bullet. **At most 8 pages** unless the
repo is clearly tiny; merge thin pages rather than shipping stubs.

**5. Remove the plan.**

```bash
rm -f openwiki/_plan.md
```

**6. Parity gate.** Verify the wiki conforms to the format contract before doing
anything else:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/check-format.sh" --dir .
```

If `ok` is `false`, the wiki violates `wiki-format.md`. Fix **each** string in
`problems` directly in the affected pages (broken links, missing `## Start
here` / `## Documentation map`, frontmatter, malformed `## Source map` /
`Git evidence:` bullets, a leftover `_plan.md`) and re-run until `ok` is `true`.
Entries in `warnings` (e.g. the 8-page soft ceiling, a page at the wiki root)
are judgment calls, not blockers. **Do not proceed to the pointer or state steps
while the gate reports `ok:false`.**

**7. Pointer section (prompt-driven).** Following the **root agent instruction
files** discipline, make the repository's top-level `AGENTS.md` / `CLAUDE.md`
point at the wiki. Write the **exact `## OpenWiki` section** from
`references/disciplines.md`, verbatim (it is byte-for-byte interchangeable with
OpenWiki's own output):
- Only top-level `AGENTS.md` / `CLAUDE.md` — never nested ones.
- If a file exists, add the `## OpenWiki` section (or update a stale one); if
  both exist, add the same section to both. If neither exists, create top-level
  `AGENTS.md` containing only that section.
- Preserve surrounding content; never duplicate an existing `## OpenWiki`
  section, and do not make formatting-only edits.

**8. Record state.** Only after the wiki content exists and the parity gate
passes, write the run metadata:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/write-state.sh" --dir . --command init --model <your-model-id>
```

Pass the model id you are actually running as (e.g. `claude-opus-4-8`) so the
provenance is accurate; if you cannot determine it, omit `--model` and the
script records the `claude-code` fallback. This writes
`openwiki/.last-update.json` (schema: `${CLAUDE_PLUGIN_ROOT}/references/state-schema.md`).

## Finish

Give the user a short summary: the pages created (with their paths), which
`AGENTS.md`/`CLAUDE.md` files you touched, and any open questions the wiki
flags. Do not paste subagent notes or the deleted plan.
