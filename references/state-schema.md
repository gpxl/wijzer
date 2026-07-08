# State schema — `openwiki/.last-update.json`

The single run-metadata file wijzer maintains. Its schema is **byte-compatible
with OpenWiki's `UpdateMetadata`** so a repository's wiki stays interchangeable
between the two tools (see [PARITY.md](../PARITY.md)). Do **not** rename the file
or change the field set.

Deterministic ownership: the file is written only by
[`scripts/write-state.sh`](../scripts/write-state.sh) and read (for `gitHead`) by
[`scripts/check-noop.sh`](../scripts/check-noop.sh), which surfaces the prior
`stateGitHead` the update skill uses to scope its prompt-driven git inspection.
Skills never hand-write it — they call `write-state.sh`.

## Location

```
openwiki/.last-update.json
```

Top-level of the wiki directory. It is **excluded** from the content snapshot
([`snapshot.sh`](../scripts/snapshot.sh)) and treated as non-meaningful by the
no-op check, so rewriting it never counts as a documentation change (churn
prevention — see [disciplines.md](disciplines.md)).

## Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `updatedAt` | string (ISO 8601, UTC) | yes | Timestamp of the run. |
| `command` | `"init"` \| `"update"` | yes | Which entrypoint wrote the file. Any other value is a usage error (exit 2). |
| `gitHead` | string (40-char SHA) | **conditional** | The repo `HEAD` at write time. **Omitted entirely** when the directory is not a git repo (mirrors `JSON.stringify` dropping an `undefined` field). Never written as `null` or `""`. |
| `model` | string | yes | The model id that produced the run, or the provenance literal `claude-code` when the caller cannot report a valid id. |

### `updatedAt` precision

wijzer emits **second precision** (`date -u +%Y-%m-%dT%H:%M:%SZ` →
`2026-07-07T14:03:22Z`). OpenWiki (JavaScript `new Date().toISOString()`) emits
**millisecond precision** (`2026-06-30T21:20:03.130Z`). Both are valid ISO 8601
UTC and both round-trip through either tool's reader — the field is provenance,
never parsed for logic. The cross-compat test in
[`tests/state.test.ts`](../tests/state.test.ts) proves `check-noop.sh` reads a
real OpenWiki-shaped file (millisecond `updatedAt`, `accounts/…` model id).

### `model` validation

`write-state.sh` accepts a caller-supplied `--model` and keeps it only if it
matches OpenWiki's `isValidModelId` charset — `^[A-Za-z0-9][A-Za-z0-9._:/+-]*$`,
≤120 chars, and containing no `://`. This admits real ids like
`claude-opus-4-8`, `claude-sonnet-4-6`, and provider-qualified ids like
`accounts/fireworks/models/glm-5p2`, while rejecting free text or URLs. Anything
that fails falls back to the stable literal `claude-code`.

Skills pass the model that actually did the work when they know it (e.g.
`claude-opus-4-8`); otherwise they omit `--model` and accept the `claude-code`
fallback.

## Serialization shape

- Pretty-printed JSON, **2-space** indent.
- Key order as written by wijzer: `updatedAt`, `command`, `gitHead` (when
  present), `model`.
- **Trailing newline.**
- Written atomically (`tmp` file + `mv`) so a concurrent reader never sees a
  half-written file.

Example (git repo, known model):

```json
{
  "updatedAt": "2026-07-07T14:03:22Z",
  "command": "update",
  "gitHead": "9f1c2ab3d4e5f60718293a4b5c6d7e8f90a1b2c3",
  "model": "claude-opus-4-8"
}
```

Example (non-git directory — `gitHead` absent, model fell back):

```json
{
  "updatedAt": "2026-07-07T14:03:22Z",
  "command": "init",
  "model": "claude-code"
}
```

## Reading it back

`check-noop.sh` extracts `gitHead` with a tolerant `sed`
(`"gitHead"\s*:\s*"…"`) rather than a JSON parser, so it reads files written by
either tool regardless of whitespace or key order. A file with no `gitHead`
yields the `"missing previous update git head"` verdict (`checkNoop: true`,
`noop: false`) — i.e. wijzer treats a stateless or non-git wiki as always worth a
real update pass.
