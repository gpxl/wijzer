---
name: ask
description: Answer a question about this repository from its wijzer/OpenWiki wiki, citing the pages and source maps the answer draws on. Never modifies the wiki. Use when the user runs /wijzer:ask or asks a question they want answered from the generated wiki.
argument-hint: <question>
disable-model-invocation: true
allowed-tools: Read, Grep, Glob
---

# /wijzer:ask — answer from the wiki

Answer the user's question — **`$ARGUMENTS`** — using the repository's generated
wiki under `openwiki/`. This is **read-only**: never create, edit, move, or
delete any file, and never write under `openwiki/`. You have only read tools, by
design.

## Steps

1. **Locate the wiki.** Confirm `openwiki/quickstart.md` exists. If `openwiki/`
   is missing or empty, tell the user there's no wiki yet and to run
   `/wijzer:init` first — then stop.
2. **Start at the quickstart.** Read `openwiki/quickstart.md` for the overview
   and the `## Documentation map` / `## Start here` links, then follow the links
   relevant to the question into the section pages.
3. **Search when needed.** Use `Grep`/`Glob` over `openwiki/` to find the pages
   that cover the question. Prefer the wiki's own words; the wiki is the source
   of truth for this command.
4. **Answer from the wiki.** Compose a direct answer grounded in what the pages
   say. If the wiki genuinely doesn't cover it, say so plainly rather than
   guessing or reading the whole codebase — suggest `/wijzer:update` if the area
   looks stale or newly added.

## Cite your sources

End the answer with a short **Sources** list: the wiki pages you drew on
(repo-relative paths, e.g. `openwiki/architecture/overview.md`), and — when a
page's `## Source map` names the underlying code — the relevant source files or
`Git evidence` commits it points to. Citations let the user verify the answer
and jump straight to the code.

Keep the answer focused on the question. Do not modify anything.
