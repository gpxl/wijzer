---
name: update
description: Refresh the wijzer/OpenWiki wiki from what changed in the repository since the last run, making surgical edits and no-opping cleanly when nothing meaningful changed. Use when the user runs /wijzer:update or asks to refresh/sync the wiki. Supports --dry-run to preview without writing.
argument-hint: [--dry-run] [instruction]
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/*), Bash(git *), Bash(rg *), Bash(rm -f openwiki/_plan.md), Read, Grep, Glob, Write, Edit, Task
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

Read and obey the doctrine throughout:

- `${CLAUDE_PLUGIN_ROOT}/references/disciplines.md` — especially the **surgical-
  edit budget** and **git discipline**.
- `${CLAUDE_PLUGIN_ROOT}/references/wiki-format.md` — format to preserve.

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
- `noop: false` → continue; `reason` explains why (e.g. `worktree has changes`,
  `git head changed`, `user message provided`).

**2. Scope the diff.**

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/diff-summary.sh" --dir .
```

Returns `commitsSince`, `changedFiles`, `sourceChanged`, `worktreeDirty`, the
`commits` list, and the `files` (name-status). Build a docs-impact plan from the
changed source: *source change → page affected → edit needed → why.* If a page
can't be tied to a real source/workflow/product/doc change, don't touch it.
Honor the soft budget: `< ~5` changed files → at most 1–2 pages; avoid
`quickstart.md` unless top-level behavior/setup/navigation changed.

**3. Snapshot before.**

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/snapshot.sh" --dir .
```

Record the `digest` — you'll compare against it to prevent churn.

**4a. If `--dry-run`:** stop now. Report the no-op verdict, the diff scope
(commits + changed files), and the specific pages you *would* edit and why. Make
**no** edits and do not run steps 5–7.

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
  do not run the pointer step — leave `.last-update.json` untouched so scheduled
  runs don't churn a PR. Report "wiki already accurate — no changes".
- **Changed** → continue to step 6.

**6. Pointer block.** Re-run the idempotent injector (picks up a newly added
`AGENTS.md`/`CLAUDE.md`, no-ops otherwise):

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/inject-pointer.sh" --dir .
```

**7. Record state.**

```bash
"${CLAUDE_PLUGIN_ROOT}/scripts/write-state.sh" --dir . --command update --model <your-model-id>
```

Pass the model id you run as; omit `--model` only if unknown (records
`claude-code`). Schema: `${CLAUDE_PLUGIN_ROOT}/references/state-schema.md`.

## Finish

Summarize the pages you edited and why, in one short list. If it was a no-op or a
content-neutral pass, say the wiki is already current. Never paste subagent
notes.
