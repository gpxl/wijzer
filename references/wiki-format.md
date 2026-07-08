<!-- GENERATED — DO NOT EDIT.
     Regenerate with: node scripts/build-disciplines.mjs
     Derived from vendor/openwiki/src/agent/prompt.ts @ 23428de0cc0b1b6d3e5d09be413e92a5d6ee451f
     Prompt-derived format rules plus wijzer's observed output literals; behavioral doctrine lives in disciplines.md.
     Drift-locked by tests/build-disciplines.test.ts. -->

# Wiki format

The exact shape of the generated wiki — a **parity contract** with OpenWiki (see [PARITY.md](../PARITY.md)): a repository's `openwiki/` folder must be interchangeable between wijzer and OpenWiki. The load-bearing literals below (the `openwiki/` directory, the `quickstart.md` entrypoint, the `## Source map` heading, page counts) must not be renamed or restyled.

## Documentation goals

- Someone with zero knowledge of the repository should be able to start at openwiki/quickstart.md and understand what the project is, how it is organized, what it does, and where to go next.
- A future agent should be able to use the docs to make high-quality code changes with less source exploration.
- Capture both technical details and business/product logic.
- Explain why important code exists, not only what files contain.
- Prefer clear Markdown with stable links between pages.
- Organize the docs like human documentation, not a raw file inventory.
- Include change-oriented guidance for future agents: where to start, what to watch out for, and which tests or checks are relevant when changing each major area.
- Keep the docs concise enough to maintain. Avoid repeating the same concept across pages; give each concept one canonical home and link to it from other pages when needed.
- Use git history for discovery, but do not include persistent commit hash lists in documentation unless a specific historical decision is important for future work.

## Section quality rules

- Do not create a directory unless it represents a real documentation area.
- A section directory should usually contain multiple substantive pages. A single-file directory is acceptable only when that page is substantial, has a clear domain boundary, and is likely to grow.
- Avoid thin pages. If a page would mostly be a stub, source map, or short note, merge it into openwiki/quickstart.md or a broader section page instead.
- Prefer headings inside broader pages before creating many small directories.
- Each page should provide real explanatory value: what the area does, why it exists, where to start, what to watch out for, and key source references.
- Before finishing an init or update run, review the openwiki/ tree. Merge, move, or remove low-value single-file directories and stub pages so the wiki remains easy to navigate and maintain.
- For small repositories with about 10 or fewer primary source files, prefer openwiki/quickstart.md plus at most 1-2 supporting pages. Avoid one-file section directories unless the boundary is clearly useful and likely to grow.
- Avoid splitting content into separate topic pages unless there is enough distinct, repository-specific behavior to justify the split.

## Required documentation structure

- openwiki/quickstart.md must be the entrypoint.
- openwiki/quickstart.md must include a high-level repository overview and links to every major section.
- When writing documentation, use `openwiki/...` paths, for example `openwiki/quickstart.md`.
- When the repository is large enough to need section directories, create one directory per major section, for example architecture/, workflows/, domain/, api/, data-models/, operations/, integrations/, testing/, or similar names that fit the repo.
- Each section directory should contain focused Markdown pages; if a directory would contain only one short page, prefer a broader page or a heading in openwiki/quickstart.md.
- Include source-file references inline where they help readers verify or continue exploring.
- Source Map sections are optional. Add one only when it materially improves navigation for that page. Prefer inline source references for short pages.
- Track the last successful documentation update in openwiki/.last-update.json.

## Page format (observed output)

wijzer pins these from OpenWiki's rendered `openwiki/` output rather than from
prompt.ts, and [`scripts/check-format.sh`](../scripts/check-format.sh) enforces
them as the interchange contract:

- **Plain Markdown, no YAML frontmatter.** The first line of every page is a
  level-1 `# ` heading in sentence case — never a `---` delimiter.
- Links between pages are relative Markdown (`./architecture/overview.md`).
- Once the wiki has **2+ pages**, `openwiki/quickstart.md` must carry both a
  `## Start here` heading and a `## Documentation map` heading linking the
  section pages.

## Source map (observed output)

A page **may** end with a source map; when present its shape is exact:

- The heading is literally `## Source map` (capital S, lowercase m).
- One Markdown bullet per source file, the repo-relative path in backticks.
- When git history is relevant, the **last** bullet is a git-evidence line:
  `` - Git evidence: commits `abc1234`, `def5678` `` — the literal
  `Git evidence: commits ` then comma-separated **7-character** backticked
  short hashes. This is the only place persistent commit hashes belong.

Verbatim example (end of a section page):

```markdown
## Source map

- `src/agent/index.ts`
- `src/agent/prompt.ts`
- Git evidence: commits `ceded10`, `f89b05d`, `dfa73cc`
```

## Size ceilings

- **Init:** at most **8** documentation pages, unless the repository is clearly
  tiny — a soft ceiling; a small repo should ship far fewer. (This number is
  prompt-derived; it also appears in the init mode block in
  [disciplines.md](disciplines.md).)
- **Update:** governed by the surgical-edit diff budget in
  [disciplines.md](disciplines.md) — fewer than ~5 changed source files means
  editing at most 1–2 pages.

---

## How this file is generated

This file is **generated** from the vendored OpenWiki system prompt
([`vendor/openwiki/src/agent/prompt.ts`](../vendor/openwiki/src/agent/prompt.ts))
by [`scripts/build-disciplines.mjs`](../scripts/build-disciplines.mjs). Do not
edit it by hand — edit the generator and re-run it. The build applies this
documented tool-vocabulary translation from OpenWiki's DeepAgents virtual
filesystem to Claude Code's real tools:

- Drop the OpenWiki brand from the identity line (behavioral parity, not naming).
  - matches "You are OpenWiki, an expert"
- Discovery/read/write/exec tools: ls,glob,grep,read_file,write_file,edit_file,execute -> Claude Code tools.
  - matches "Prefer built-in filesystem discovery tools such as ls, glob, grep, read…"
- Virtual filesystem rooting + virtual paths -> repository-relative paths and Claude Code tools.
  - matches "Filesystem tools are rooted at the target repository. Use virtual paths…"
- DeepAgents warns against host-absolute paths; Claude Code's file tools require absolute paths, so invert to the correct guidance.
  - matches "Never pass host absolute paths like /Users/... to filesystem tools; tha…"
- `shell execute` -> `Bash`.
  - matches "Shell execute commands run on the host. If you use execute, run command…"
- glob tool + shell -> Glob + Bash.
  - matches "Do not call glob with **/* from the repository root."
- shell commands -> Bash commands.
  - matches "Prefer shell commands like rg --files with excludes"
- grep/glob -> Grep/Glob.
  - matches "Prefer grep/glob and short targeted reads over full-file reads when fil…"
- task tool -> Task tool with the wiki-scout subagent.
  - matches "You may use the task tool to parallelize read-only research"
- Virtual plan path -> repository-relative; drop the virtual filesystem qualifier.
  - matches "Use /openwiki/_plan.md when writing this temporary plan with filesystem…"
- No filesystem delete tool in Claude Code -> delete with Bash.
  - matches "If there is no filesystem delete tool, use shell execute from the repos…"
- Virtual output paths -> repository-relative.
  - matches "When writing required documentation with filesystem tools, use /openwik…"
- OpenWiki's CLI records state; wijzer's write-state.sh does (both mode blocks).
  - matches "The CLI will record successful run metadata in openwiki/.last-update.js…"
- `shell execution` fallback -> `Bash` (update mode).
  - matches "If shell execution is unavailable,"
- Leading-slash AGENTS.md path.
  - matches `\/AGENTS\.md`
- Leading-slash CLAUDE.md path.
  - matches `\/CLAUDE\.md`
- Leading-slash openwiki path.
  - matches `\/openwiki`

Two more rules beyond the vocabulary swap:

- `OpenWiki CLI reference:` is **dropped** — its subject, the `openwiki` CLI flag
  surface, is out of wijzer's parity scope, since wijzer's runtime is Claude Code
  skills (`/wijzer:init`, `:update`, `:ask`), not a CLI.
- Fenced ```code blocks are **preserved verbatim** — not translated and not
  residual-vocab-checked. The `## OpenWiki` pointer block under "Root agent
  instruction files" is the exact literal the agent must reproduce byte-for-byte
  into a repository's AGENTS.md/CLAUDE.md, so it keeps OpenWiki's own `/openwiki`
  path for an interchangeable wiki.
