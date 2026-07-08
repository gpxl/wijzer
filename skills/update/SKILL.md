---
name: update
description: Refresh the wijzer/OpenWiki wiki from what changed in the repository since the last run, making surgical edits and no-opping cleanly when nothing meaningful changed. Use when the user runs /wijzer:update or asks to refresh/sync the wiki. Supports --dry-run to preview without writing.
argument-hint: [--dry-run] [instruction]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(git log:*), Bash(git show:*), Bash(git diff:*), Bash(git status:*), Bash(git blame:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git cat-file:*), Bash(git ls-files:*), Bash(git shortlog:*), Bash(rg *), Read, Grep, Glob, Write, Edit, Task
---

# /wijzer:update — refresh the wiki from recent changes

Bring `openwiki/` up to date with what changed in the repo, **surgically** and
without churn. Parse `$ARGUMENTS`:

- A leading **`--dry-run`** token → preview mode: run every read-only step, report
  what *would* change, and **write nothing** (no page edits, no state, no
  pointer). Everything after the flag is still treated as the instruction.
- Any remaining text → a **user instruction** that scopes or forces the update
  (e.g. `document the new webhook flow`). A non-empty instruction forces a real
  update pass even if nothing changed by git.

Read and obey the doctrine throughout (generated from OpenWiki's own prompt):

- `${CLAUDE_PLUGIN_ROOT}/references/disciplines.md` — especially the **git
  discipline**, the **update mode block**, and the exact `## OpenWiki` pointer.
- `${CLAUDE_PLUGIN_ROOT}/references/wiki-format.md` — format to preserve.

Git inspection and the pointer are **prompt-driven** — you run git and write the
pointer yourself. The no-op, snapshot, state, and format bookkeeping stay in the
bundled scripts; each prints one JSON object.

## Steps

**1. No-op preflight.** Pass the instruction (if any) so a user message forces
the run:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/check-noop.sh" --dir . --user-message "<instruction or empty>"
```

Use the JSON verdict:
- Exit 2 → not a git repo; tell the user and stop.
- `noop: true` → the wiki is already current. **Stop here.** Report "wiki already
  current — nothing to update" and write nothing. (In `--dry-run`, report the same.)
- `noop: false` → continue; `reason` explains why.

**2. Scope the diff (prompt-driven git inspection).** Following the **git
discipline**, inspect what changed since the last successful run. Read the
baseline from `openwiki/.last-update.json` and scope the log exactly as OpenWiki
does — prefer the recorded `gitHead`, fall back to the `updatedAt` timestamp,
then to recent history. (Read the file yourself; `check-noop.sh`'s `stateGitHead`
is empty when you passed an instruction, so don't rely on it here.)

```bash
# if .last-update.json has a gitHead:
git log <gitHead>..HEAD --name-status --oneline
# else if it has updatedAt but no gitHead:
git log --since "<updatedAt>" --name-status --oneline
# else (no prior baseline at all):
git log --max-count=20 --name-status --oneline
```

Then account for uncommitted local changes:

```bash
git diff --name-status HEAD
git status --short
```

Build a docs-impact plan from the changed **source** files: *source change →
page affected → edit needed → why.* If a page can't be tied to a real
source/workflow/product/doc change, don't touch it. Honor the soft budget: fewer
than ~5 changed source files → at most 1–2 pages; avoid `quickstart.md` unless
top-level behavior/setup/navigation changed. Use `git show`/`git blame` on
high-signal changed files to understand *why* they changed.

**3. Snapshot before.**

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/snapshot.sh" --dir .
```

Record the `digest` — you'll compare against it to prevent churn.

**4a. If `--dry-run`:** stop now. Report the no-op verdict, the diff scope
(commits + changed files from step 2), and the specific pages you *would* edit
and why. Make **no** edits and do not run steps 5–8.

**4b. Otherwise, edit surgically.** Make the minimal accurate edits per your
impact plan. Preserve accurate structure and wording; replace stale sentences
rather than piling on paragraphs. No formatting-only edits; don't disturb source
maps / git-evidence / "things to watch" unless the changes made them wrong. If a
genuinely new area needs a page, add one (respect the ceilings in
wiki-format.md). You may launch **1–2** read-only `wiki-scout` subagents (the
Task tool with `subagent_type: wiki-scout`) for an unfamiliar changed domain.

**5. Snapshot after & churn check.**

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/snapshot.sh" --dir .
```

Compare to the step-3 `digest`:
- **Unchanged** → your edits netted no content change. **Do not write state** and
  do not touch the pointer — leave `.last-update.json` untouched so scheduled
  runs don't churn a PR. Report "wiki already accurate — no changes".
- **Changed** → continue to step 6.

**6. Parity gate.** Now that content actually changed, verify it still conforms
to the format contract:

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/check-format.sh" --dir .
```

If `ok` is `false`, fix **each** string in `problems` in the affected pages
(broken links, missing quickstart linking headings, frontmatter, malformed
`## Source map` / `Git evidence:` bullets) and re-run until `ok` is `true`;
`warnings` are judgment calls, not blockers. **Do not run the pointer or state
steps while the gate reports `ok:false`.** (This gate does not run in the
`--dry-run` or no-op paths — those already stopped above.)

**7. Pointer section (prompt-driven).** Following the **root agent instruction
files** discipline, inspect the top-level `AGENTS.md` / `CLAUDE.md`. Add the
exact `## OpenWiki` section from `references/disciplines.md` if it is missing
(e.g. a repo that gained an `AGENTS.md`/`CLAUDE.md` since init), or refresh it
only if a present one is semantically stale. Do **not** duplicate an existing
section and do **not** make formatting-only edits — no-op when it is already
correct.

**8. Record state.**

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/write-state.sh" --dir . --command update --model <your-model-id>
```

Pass the model id you run as; omit `--model` only if unknown (records
`claude-code`). Schema: `${CLAUDE_PLUGIN_ROOT}/references/state-schema.md`.

## Finish

Summarize the pages you edited and why, in one short list. If it was a no-op or a
content-neutral pass, say the wiki is already current. Never paste subagent
notes.
