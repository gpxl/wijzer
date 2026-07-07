# Headless / non-interactive use

Because wijzer's commands are Claude Code skills, they run non-interactively with
`claude -p` (print mode) — no TUI, prints the result and exits. This is the same
surface OpenWiki exposes with `--print`, so any automation you'd wire around
OpenWiki works here, using your Claude subscription instead of an API key.

## Prerequisites

- Claude Code installed and signed in (Pro/Max subscription).
- The wijzer plugin installed once:

  ```
  /plugin marketplace add gpxl/wijzer
  /plugin install wijzer@wijzer
  ```

- Run the commands **from the root of the target git repository**.

## Recipes

Refresh the wiki (no-ops cleanly when nothing meaningful changed):

```bash
claude -p "/wijzer:update"
```

Preview what an update would do, writing nothing:

```bash
claude -p "/wijzer:update --dry-run"
```

Generate the wiki the first time:

```bash
claude -p "/wijzer:init"
```

Focused init or a scoped update instruction:

```bash
claude -p "/wijzer:init the payments subsystem"
claude -p "/wijzer:update document the new webhook flow"
```

Ask a question of the wiki (read-only, never writes):

```bash
claude -p "/wijzer:ask how does auth work?"
```

## Notes

- **Exit behavior:** print mode runs the skill to completion and exits. A
  `/wijzer:update` no-op still exits successfully — it just reports that the wiki
  is already current and leaves `openwiki/.last-update.json` untouched.
- **Permissions:** the first run may prompt to allow the wijzer scripts and git.
  In fully unattended contexts, pre-approve them via a committed
  `.claude/settings.json` (`permissions.allow`) or Claude Code's headless
  permission flags — grant only the wijzer scripts, `git`, and (for the CI PR
  flow) `gh`.
- **CI:** for a scheduled refresh that opens a PR, prefer
  [`github-action.yml`](github-action.yml) — it uses the official
  `claude-code-action` with a subscription OAuth token, so there's no API key in
  CI either.
