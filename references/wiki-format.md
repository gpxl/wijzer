# Wiki format

The exact shape of the generated wiki. This is a **parity contract** with
OpenWiki (see [PARITY.md](../PARITY.md)): a repository's `openwiki/` folder must
be interchangeable between wijzer and OpenWiki. The literals below — directory
name, entrypoint filename, the `## Source map` heading, the `Git evidence:` line
— are load-bearing. Do not rename or restyle them.

## Layout

```
openwiki/
├── quickstart.md                     # entrypoint — always present, written first
├── architecture/overview.md          # section pages live in per-topic subdirs
├── agent/workflow.md
├── operations/…
└── .last-update.json                 # run metadata — see references/state-schema.md
```

- **Directory:** `openwiki/` at the repository root. Never a different name.
- **Entrypoint:** `openwiki/quickstart.md` — **not** `index.md`, `README.md`, or
  `home.md`. It is written first and links to every major section.
- **Section pages:** grouped into per-topic subdirectories. Use names that fit
  the repo, drawn from this vocabulary: `architecture/`, `workflows/`,
  `domain/`, `api/`, `data-models/`, `operations/`, `integrations/`,
  `testing/`. Don't invent a directory per file.

## Page rules

- **Plain Markdown. No YAML frontmatter.** The first line of every page is a
  level-1 heading in sentence case (`# Architecture overview`), never a `---`
  delimiter.
- After the H1: a short intro paragraph, then `##` sections and occasional
  `###` subsections. There is no rigid template — compose headings that fit the
  content.
- **Links between pages are relative Markdown** (`./architecture/overview.md`).
- **Ground every claim.** Do not invent files, modules, APIs, business rules, or
  behavior. Every important statement traces to a source file, an existing doc,
  or git evidence you actually inspected.
- **No thin pages.** If a page would be little more than a stub or a source map,
  merge it into `quickstart.md` or a broader section page. For small repos
  (~10 or fewer primary source files), prefer `quickstart.md` plus at most 1–2
  supporting pages.

## `quickstart.md` specifics

`quickstart.md` must give a high-level repository overview and link to every
major section. Two linking conventions, both plain relative links:

- **`## Start here`** — a bulleted list of links to each major section page,
  each with a trailing em-dash description.
- **`## Documentation map`** — a plainer bulleted index (label → relative path),
  one entry per top-level section.

Observed section shape (not mandatory, but a good default): `## What this
repository does`, `## Start here`, `## Key source files`, `## Documentation
map`, `## Notes for future agents`, and a trailing `## Source map`.

## Source map (the load-bearing detail)

A page **may** end with a source map. It is **optional** — add one only when it
materially improves navigation for that page; prefer inline source references
for short pages, and don't add a source map just to have one.

When present, the format is exact:

- Heading is literally `## Source map` (capital S, lowercase m).
- A single Markdown bullet list. Each source file is one bullet, the repo-
  relative path wrapped in backticks.
- When git history is relevant, the **last** bullet is a git-evidence line:
  `` Git evidence: commits `abc1234`, `def5678` `` — the word `Git evidence:
  commits ` followed by comma-separated **7-character** short hashes, each in
  backticks. This is the only place persistent commit hashes belong; do not
  scatter hash lists elsewhere in the prose.

Verbatim example (end of a section page):

```markdown
## Source map

- `src/agent/index.ts`
- `src/agent/prompt.ts`
- `src/agent/utils.ts`
- Git evidence: commits `ceded10`, `f89b05d`, `dfa73cc`
```

During an **update** run, do not touch existing source maps, git-evidence
lists, or generic "things to watch" sections unless the recent source changes
made them materially wrong.

## Size ceilings

- **Init:** at most **8** documentation pages, unless the repository is clearly
  tiny. This is a soft ceiling — a small repo should ship far fewer.
- **Update:** governed by the surgical-edit budget in
  [disciplines.md](disciplines.md) — roughly, fewer than ~5 changed source files
  means editing at most 1–2 pages.

## Root instruction pointer

After generating the wiki, the repo's `AGENTS.md` / `CLAUDE.md` gets a pointer
block directing coding agents to read `openwiki/quickstart.md` first. wijzer
writes this idempotently via [`scripts/inject-pointer.sh`](../scripts/inject-pointer.sh)
(marker-delimited, safe to re-run) rather than free-editing the file. See the
init and update skills for when it runs.
