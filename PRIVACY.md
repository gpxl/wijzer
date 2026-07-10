# Privacy Policy

wijzer is a [Claude Code](https://claude.com/claude-code) plugin that runs
entirely on your own machine. It is skills plus dependency-free shell scripts
(git + coreutils) — there is no wijzer server, account, or backend.

## What wijzer collects

**Nothing.** wijzer collects, stores, and transmits no personal data, usage
analytics, or telemetry. Its runtime scripts make no network calls of their own.

## What wijzer does with your data

- **Reads** your local git repository (source, history, config) to understand it.
- **Writes** the generated wiki to `openwiki/` in your repository, a small state
  file at `openwiki/.last-update.json`, and a pointer section in your
  `CLAUDE.md` / `AGENTS.md`.

All of this stays inside your repository, on your machine. wijzer does not send
your code or the generated wiki anywhere.

## Third-party processing (Anthropic)

wijzer generates the wiki using Claude Code's own inference. When you run
`/wijzer:init`, `/wijzer:update`, or `/wijzer:ask`, Claude Code sends the
repository content it reads to Anthropic to produce the output. That processing is
governed by [Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy)
and your Claude subscription terms — not by wijzer. wijzer adds no data collection
on top of Claude Code.

## Maintenance tooling

A development-only script (`scripts/vendor-openwiki.sh`) fetches OpenWiki source
from GitHub when a maintainer bumps the parity pin. End users never run it, and it
is not part of the plugin's runtime.

## Changes

Any updates to this policy are committed to this file in the wijzer repository, so
its history is public and auditable.

## Contact

Questions or concerns: open an issue at
<https://github.com/gpxl/wijzer/issues>.
