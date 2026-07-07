---
name: init
description: Generate the wijzer/OpenWiki wiki for this repository from scratch into openwiki/, then add a pointer block to AGENTS.md / CLAUDE.md. Use when the user runs /wijzer:init or asks to create/bootstrap the repository wiki.
argument-hint: [focus]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(git *), Bash(rg *), Bash(rm -f openwiki/_plan.md), Read, Grep, Glob, Write, Edit, Task
---

# /wijzer:init — generate the wiki from scratch

Build a fresh `openwiki/` wiki for the current repository. Optional focus:
**`$ARGUMENTS`** — if non-empty, bias discovery and page selection toward that
area (e.g. `auth`, `the billing pipeline`), but still ship a coherent
whole-repo quickstart.

First read the two doctrine files and follow them throughout — they carry the
parity contract:

- `${CLAUDE_PLUGIN_ROOT}/references/wiki-format.md` — exact output format.
- `${CLAUDE_PLUGIN_ROOT}/references/disciplines.md` — run / subagent / planning /
  git disciplines and size ceilings.

Deterministic bookkeeping is owned by the bundled scripts — call them, don't
re-implement them. Each prints one JSON object.

## Steps

**1. Inventory (cheap discovery).** Run:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/inventory.sh" --dir .
```

This returns `root`, `manifests`, `entrypoints`, `recentCommits`,
`topExtensions`, and a bounded `sampleFiles` list. Use it as your repo map. If
it exits non-zero (exit 2 = not a git repository), stop and tell the user
`/wijzer:init` needs to run inside a git repository.

**2. Targeted discovery.** Following the run discipline, inspect the manifests,
entrypoints, README-style files, routing, and schema files, plus a
representative file or two per major domain. Use `git log`/`git show`/`git
blame` on high-signal files to learn *why* the code exists. Do **not** read the
whole tree.

**3. Fan out (only if warranted).** For a repo with multiple substantial,
independent domains, launch **1–2** `wiki-scout` subagents (the Task tool with
`subagent_type: wiki-scout`) with narrow read-only briefs (e.g. "data model",
"API surface"). Use 3–4 only for a clearly small/medium repo or when the user
asked for depth. Synthesize their notes yourself — they never write.

**4. Plan.** Write `openwiki/_plan.md` listing the intended pages, the source
evidence for each, and open questions. This is temporary.

**5. Generate.** Write `openwiki/quickstart.md` **first** (overview + `## Start
here` + `## Documentation map` linking every section), then the linked section
pages under topic subdirectories. Respect the format: plain Markdown, no
frontmatter, H1 first line, optional `## Source map` with a trailing
`` Git evidence: commits `abc1234` `` bullet. **At most 8 pages** unless the
repo is clearly tiny; merge thin pages rather than shipping stubs.

**6. Remove the plan.**

```bash
rm -f openwiki/_plan.md
```

**7. Pointer block.** Point coding agents at the wiki idempotently:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/inject-pointer.sh" --dir .
```

This creates or appends a marker-delimited block in `AGENTS.md` / `CLAUDE.md`
(safe to re-run). Report its `results` to the user.

**8. Record state.** Only after the wiki content exists, write the run metadata:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/write-state.sh" --dir . --command init --model <your-model-id>
```

Pass the model id you are actually running as (e.g. `claude-opus-4-8`) so the
provenance is accurate; if you cannot determine it, omit `--model` and the
script records the `claude-code` fallback. This writes
`openwiki/.last-update.json` (schema: `${CLAUDE_PLUGIN_ROOT}/references/state-schema.md`).

## Finish

Give the user a short summary: the pages created (with their paths), which
`AGENTS.md`/`CLAUDE.md` files were touched, and any open questions the wiki
flags. Do not paste subagent notes or the deleted plan.
