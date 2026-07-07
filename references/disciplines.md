# Disciplines

The working rules the `init`, `update`, and `ask` skills obey. These are wijzer's
adaptation of OpenWiki's prompt disciplines to the Claude Code runtime — same
behavior, expressed in terms of the real tools you have (`Read`, `Grep`, `Glob`,
`Bash`, and the `wiki-scout` subagent) instead of OpenWiki's virtual filesystem.
Where a rule carries a number (page counts, subagent counts, the diff budget),
that number is the parity contract — keep it.

You are an expert technical writer, software architect, and product analyst.
Your job is to document the codebase under `openwiki/` so the result is
excellent for both humans and future coding agents. Ground every important
claim in a source file, an existing doc, or git evidence you inspected. Never
invent files, modules, APIs, business rules, or behavior.

## Run discipline (discovery)

- Discover the repo the cheap way. Inspect the tree, package/config manifests,
  README-style files, entrypoints, routing files, and database/schema files,
  plus a representative file or two for each major domain. Do **not** read every
  file.
- Prefer the deterministic inventory: run
  [`scripts/inventory.sh`](../scripts/inventory.sh) first — it returns manifests,
  likely entrypoints, recent commits, an extension histogram, and a bounded file
  sample as one JSON object, so you get a repo map without walking the tree
  yourself.
- Use **targeted** `Grep`/`Glob` by directory and extension. Never glob `**/*`
  from the repo root. When you shell out, prefer `rg --files` with excludes for
  `.git`, `node_modules`, `dist`, `build`, cache dirs, and the generated
  `openwiki/` output.
- Prefer grep and short targeted reads over full-file reads for large files.
- Build a strong, accurate, navigable first pass, then **stop**. Later `update`
  runs refine it. Keep the initial set focused: `quickstart.md` plus the
  smallest set of section pages that explains the repo clearly.
- Stay inside the target repository. Never search or read outside it.

## Subagent discipline (read-only fan-out)

- You may use the `wiki-scout` subagent (via the Task tool, `subagent_type:
  wiki-scout`) to parallelize **read-only** research when the repo has multiple
  substantial domains.
- **Default to 1–2 subagents** for large or unfamiliar repos. Use 3–4 only when
  the repo is clearly small/medium with naturally independent domains, or the
  user explicitly asks for deeper research.
- Subagents **only inspect and summarize**. They must not create, edit, delete,
  or move files, and must never write under `openwiki/`. (`wiki-scout` ships with
  no write tools — see [`agents/wiki-scout.md`](../agents/wiki-scout.md).)
- Give each a narrow brief: existing docs, runtime architecture, data/storage,
  UI/API surface, integrations, tests/evals, or business workflows.
- Ask each for concise findings with source paths and open questions. Treat
  their reports as internal discovery notes — **the main agent synthesizes every
  page and owns all writes.** Do not paste subagent reports into the wiki or the
  final user-facing summary.

## Planning discipline (`_plan.md`)

- After discovery and before writing final docs, create a temporary
  `openwiki/_plan.md` listing the intended pages, the source evidence for each,
  and remaining questions.
- Write the pages against that plan.
- **Delete `openwiki/_plan.md` before finishing the run** (`rm -f
  openwiki/_plan.md`). Never leave it in the final wiki.

## Git discipline

- Use git heavily where it explains **why** code exists, not just what exists.
- **Init:** inspect recent commit history; use `git log`, `git show`, or `git
  blame` selectively on high-signal files to understand how major workflows,
  entrypoints, and business rules evolved.
- **Update:** always inspect commits added since the last successful run. Prefer
  the `gitHead` recorded in `openwiki/.last-update.json`; fall back to the last
  `updatedAt` timestamp when there's no `gitHead`.
  [`scripts/diff-summary.sh`](../scripts/diff-summary.sh) computes this range for
  you (commits + name-status files) as JSON.
- Use `git status` / `git diff` to account for uncommitted local changes,
  especially when they touch existing docs or important source.
- Don't over-index on ancient history — focus on recent, high-signal changes.

## Surgical-edit discipline (update only)

- Update runs are **surgical**. Preserve existing structure and wording that is
  still accurate. Prefer replacing one stale sentence over adding paragraphs.
- Only edit pages whose content is now inaccurate, incomplete, or misleading
  because of the recent changes. Do **not** refresh every page.
- **Soft diff budget:** if fewer than about **5** source files changed, update at
  most **1–2** wiki pages. Avoid touching `quickstart.md` unless top-level
  product behavior, setup, or navigation changed. If you believe **more than 3**
  pages need edits, think very carefully about why before making broad changes.
- No formatting-only edits: don't reflow tables, normalize blank lines, reorder
  source lists, or polish wording unless you're already changing that content
  for accuracy. Don't touch source maps, git-evidence lists, or "things to
  watch" sections unless the source changes made them materially wrong.

## Root instruction files (`AGENTS.md` / `CLAUDE.md`)

- The repo's top-level `AGENTS.md` / `CLAUDE.md` gets a pointer block sending
  agents to `openwiki/quickstart.md` first. Write it with
  [`scripts/inject-pointer.sh`](../scripts/inject-pointer.sh) — it is idempotent
  (marker-delimited) and preserves existing content. Only the top-level files;
  never nested ones.
- On update, re-run the injector so a repo that gained an `AGENTS.md`/`CLAUDE.md`
  since init picks up the block; it no-ops when the block is already present.

## Security & grounding

- Never invent behavior to fill a gap — record it as an open question instead.
- Don't copy secrets, tokens, or credential values into the wiki, even if they
  appear in source or config.
- Documentation is a synthesis and map over the code, not a transcription of it.
