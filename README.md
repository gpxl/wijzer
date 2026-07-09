# wijzer

**An OpenWiki for your codebase, powered by your Claude subscription — no API keys.**

`wijzer` (Dutch: *signpost* / *wiser*) is a [Claude Code](https://claude.com/claude-code)
plugin that generates and maintains an agent-facing wiki for a repository, and
keeps it fresh from your git history. Coding agents read the wiki for grounded
context before they touch a subsystem.

It reaches **format + behavior parity** with
[OpenWiki](https://github.com/langchain-ai/openwiki) — the generated `openwiki/`
folder, the `.last-update.json` state, and the update algorithm are
interchangeable between the two tools — with one deliberate difference:

> **OpenWiki calls an LLM provider and needs an API key.** wijzer runs *inside*
> Claude Code, so the inference is your existing **Claude Pro/Max subscription**.
> There is no key to configure and no per-token bill. (This is also the only
> ToS-legitimate way to use a Claude subscription for this — a plugin doesn't
> offer login, Claude Code is the runtime.)

## Install

```
/plugin marketplace add gpxl/wijzer
/plugin install wijzer@wijzer
```

## Use

| Command | What it does |
|---|---|
| `/wijzer:init [focus]` | Generate the wiki from scratch into `openwiki/`, and add a pointer block to your `AGENTS.md` / `CLAUDE.md`. |
| `/wijzer:update [instruction]` | Refresh the wiki from what changed since the last run. No-ops cleanly when nothing meaningful changed. |
| `/wijzer:ask <question>` | Answer a question from the wiki, with source-map citations. Never modifies the wiki. |

### Headless / CI

Because the commands are just skills, you can run them non-interactively:

```
claude -p "/wijzer:update"
```

`examples/github-action.yml` shows a scheduled refresh that opens a PR, using
Anthropic's official [claude-code-action](https://github.com/anthropics/claude-code-action)
with a subscription OAuth token (`claude setup-token`) — no API key in CI either.

## How it works

wijzer splits deterministic bookkeeping from model judgment:

- **`scripts/`** — dependency-free bash (git + coreutils) that owns the
  exact-semantics bookkeeping: the update no-op verdict (`check-noop`), the
  content snapshot (`snapshot`), the state file (`write-state`), and the output
  format gate (`check-format`). Each emits one JSON object; each is unit-tested
  against real temp git repos (`npm test`).
- **`skills/` + `agents/`** — the model does discovery, git inspection, page
  planning, writing, and the `AGENTS.md`/`CLAUDE.md` pointer **prompt-driven**,
  obeying the disciplines in `references/` (generated from OpenWiki's own prompt)
  and calling the scripts above for the bookkeeping.

See [PARITY.md](PARITY.md) for exactly what matches OpenWiki and how it's
verified, and [`CONTRIBUTING`](#contributing) below to hack on it.

## Requirements

- Claude Code with an active Claude subscription.
- `git` and a POSIX shell. On Windows, use Git Bash or WSL.
- **No Node.js at runtime.** The plugin is skills + dependency-free bash; nothing
  it runs for you needs `node`. Node is a **development/CI-only** dependency —
  it's used to run the Vitest suite and to regenerate `references/disciplines.md`
  and `references/wiki-format.md` from the vendored OpenWiki prompt (the committed
  output ships in the plugin, so you never run the generator).

## Contributing

Node is needed here (dev/CI only), not by end users:

```
npm install
npm test          # Vitest: scripts vs temp git repos + the vendored OpenWiki parity tests
npm run lint      # shellcheck
```

When OpenWiki evolves, re-derive the generated doctrine and re-prove parity:

```
scripts/vendor-openwiki.sh --sha <new>        # re-vendor the spec at a new SHA
node scripts/build-disciplines.mjs            # regenerate the reference docs
npm test                                      # cross-validation re-proves parity
```

Contributions welcome — especially parity fixes when OpenWiki evolves (see the
re-validation procedure in [PARITY.md](PARITY.md)).

## License & lineage

MIT. wijzer is an independent reimplementation and ships none of OpenWiki's
source; the wiki format, state schema, update algorithm, prompt disciplines, and
test structure are adapted from OpenWiki (MIT, © LangChain, Inc.) — see the
attribution in [LICENSE](LICENSE).
