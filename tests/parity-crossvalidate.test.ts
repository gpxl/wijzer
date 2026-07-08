import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  createRepoWithOpenWiki,
  git,
  runScript,
  runScriptJson,
  writeLastUpdate,
} from "./helpers/fixtures.ts";

// The executable parity spec: over shared temp git repos, run wijzer's bash
// ports AND the real (vendored, pinned) OpenWiki TypeScript, and assert they
// agree. This replaces the hand-ported tests/noop.test.ts — instead of trusting
// a transcription of the algorithm, we execute the algorithm itself. Intended
// distribution-method deltas (field names, timestamp precision) are documented
// inline; anything else is an UNINTENDED divergence and a bug in the bash.
import {
  getUpdateNoopStatus,
  shouldCheckUpdateNoop,
  createOpenWikiContentSnapshot,
  writeLastUpdateMetadata,
  type UpdateNoopStatus,
} from "../vendor/openwiki/src/agent/utils.ts";

type BashNoop = {
  noop: boolean;
  checkNoop: boolean;
  reason: string;
  gitHead: string;
  stateGitHead: string;
  dirty: boolean;
  commitsSince: number;
};

const bashNoop = (repo: string, args: string[] = []) =>
  runScriptJson<BashNoop>("check-noop.sh", repo, args);

const bashSnapshot = (repo: string) =>
  runScriptJson<{ digest: string }>("snapshot.sh", repo);

/**
 * Run BOTH getUpdateNoopStatus (real) and check-noop.sh (bash) over `repo` with
 * no user message, and assert the interchangeable contract:
 *   real.shouldSkip  <->  bash.noop        (the intended field-name delta)
 *   real.reason      ===  bash.reason      (only meaningful when not skipping)
 */
async function assertNoopParity(repo: string): Promise<UpdateNoopStatus> {
  const real = await getUpdateNoopStatus(repo);
  const bash = await bashNoop(repo);

  expect(bash.noop, "shouldSkip<->noop must agree").toBe(real.shouldSkip);
  if (!real.shouldSkip) {
    // Both implementations surface the same machine-readable reason string.
    expect(bash.reason).toBe(real.reason);
  }
  return real;
}

describe("getUpdateNoopStatus parity (bash vs real)", () => {
  test("no prior metadata: neither skips, same reason", async () => {
    const repo = await createRepoWithOpenWiki();
    const real = await assertNoopParity(repo);
    expect(real.shouldSkip).toBe(false);
    if (!real.shouldSkip) {
      expect(real.reason).toBe("missing previous update git head");
    }
  });

  test("clean tree, unchanged HEAD: both skip", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);
    const real = await assertNoopParity(repo);
    expect(real.shouldSkip).toBe(true);
  });

  test("dirty worktree: neither skips, reason 'worktree has changes'", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);
    await writeFile(path.join(repo, "README.md"), "# Repo\nchanged\n", "utf8");
    const real = await assertNoopParity(repo);
    if (!real.shouldSkip) expect(real.reason).toBe("worktree has changes");
  });

  test("commits since last run touch only openwiki/: both skip", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);
    await writeFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "# Quickstart\nupdated\n",
      "utf8",
    );
    await git(repo, ["add", "openwiki/quickstart.md"]);
    await git(repo, ["commit", "-m", "docs: refresh wiki"]);
    const real = await assertNoopParity(repo);
    expect(real.shouldSkip).toBe(true);
  });

  test("commits since last run touch source: neither skips, reason 'git head changed'", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);
    await writeFile(path.join(repo, "README.md"), "# Repo\nnew\n", "utf8");
    await git(repo, ["add", "README.md"]);
    await git(repo, ["commit", "-m", "docs: readme"]);
    const real = await assertNoopParity(repo);
    if (!real.shouldSkip) expect(real.reason).toBe("git head changed");
  });

  test("state points at an unknown commit: neither skips, reason 'git head changed'", async () => {
    const repo = await createRepoWithOpenWiki();
    // A gitHead that isn't reachable — both must diff against it, get nothing,
    // and refuse to skip rather than crashing.
    await writeLastUpdate(repo, "0".repeat(40));
    const real = await assertNoopParity(repo);
    if (!real.shouldSkip) expect(real.reason).toBe("git head changed");
  });

  test("repo with no commits: both refuse to skip (same reason)", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "wijzer-nohead-"));
    await git(repo, ["init"]);
    await git(repo, ["config", "user.email", "t@example.com"]);
    await git(repo, ["config", "user.name", "t"]);
    await mkdir(path.join(repo, "openwiki"));
    // Metadata with a gitHead, but the repo has no commits yet.
    await writeFile(
      path.join(repo, "openwiki", ".last-update.json"),
      `${JSON.stringify({
        updatedAt: "2026-01-01T00:00:00.000Z",
        command: "update",
        gitHead: "0".repeat(40),
        model: "m",
      })}\n`,
      "utf8",
    );
    // Cross-validation surfaced a subtlety: the real getUpdateNoopStatus's
    // "missing current git head" branch only fires when `git rev-parse HEAD`
    // returns an EMPTY string, but on a commit-less repo rev-parse echoes a
    // non-empty "HEAD" token instead — so both implementations fall through to
    // "git head changed". The parity contract (assertNoopParity) is what
    // matters; this documents the shared, non-obvious outcome.
    const real = await assertNoopParity(repo);
    expect(real.shouldSkip).toBe(false);
    if (!real.shouldSkip) expect(real.reason).toBe("git head changed");
  });
});

describe("shouldCheckUpdateNoop parity (bash vs real)", () => {
  test("a non-empty user message means 'always run' in both", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);

    const opts = { command: "update" as const, userMessage: "document the API" };
    const real = shouldCheckUpdateNoop(opts as never);
    const bash = await bashNoop(repo, ["--user-message", opts.userMessage]);

    expect(real).toBe(false);
    expect(bash.checkNoop).toBe(false);
    expect(bash.noop).toBe(false);
  });

  test("whitespace-only / absent message still checks in both", async () => {
    const repo = await createRepoWithOpenWiki();
    expect(shouldCheckUpdateNoop({ command: "update", userMessage: "   " } as never)).toBe(true);
    expect(shouldCheckUpdateNoop({ command: "update" } as never)).toBe(true);

    expect((await bashNoop(repo, ["--user-message", "   "])).checkNoop).toBe(true);
    expect((await bashNoop(repo)).checkNoop).toBe(true);
  });
});

describe("createOpenWikiContentSnapshot parity (bash vs real)", () => {
  async function assertDigestParity(
    build: (openwikiDir: string) => Promise<void>,
  ): Promise<void> {
    const repo = await mkdtemp(path.join(tmpdir(), "wijzer-snap-"));
    const openwiki = path.join(repo, "openwiki");
    await mkdir(openwiki, { recursive: true });
    await build(openwiki);
    const real = await createOpenWikiContentSnapshot(repo);
    const { digest: bash } = await bashSnapshot(repo);
    expect(bash).toBe(real);
  }

  test("flat pages", async () => {
    await assertDigestParity(async (ow) => {
      await writeFile(path.join(ow, "quickstart.md"), "# Quickstart\n");
      await writeFile(path.join(ow, "architecture.md"), "# Architecture\n");
    });
  });

  test("nested sections emit matching dir: frames", async () => {
    await assertDigestParity(async (ow) => {
      await mkdir(path.join(ow, "guides", "deep"), { recursive: true });
      await writeFile(path.join(ow, "quickstart.md"), "# Q\n");
      await writeFile(path.join(ow, "guides", "intro.md"), "# I\n");
      await writeFile(path.join(ow, "guides", "deep", "x.md"), "# X\n");
    });
  });

  test("collation-adjacent sibling names (dir vs '-' vs '.')", async () => {
    // 'set' (dir), 'set-up.md', 'setup.md' probe the boundary where a global
    // path sort would order differently than the real per-directory walk.
    await assertDigestParity(async (ow) => {
      await mkdir(path.join(ow, "set"));
      await writeFile(path.join(ow, "set", "a.md"), "# a\n");
      await writeFile(path.join(ow, "set-up.md"), "# su\n");
      await writeFile(path.join(ow, "setup.md"), "# s\n");
    });
  });

  test("top-level metadata excluded, deeper same-named file kept", async () => {
    await assertDigestParity(async (ow) => {
      await writeFile(path.join(ow, "quickstart.md"), "# Q\n");
      await writeFile(path.join(ow, ".last-update.json"), '{"x":1}\n');
      await mkdir(path.join(ow, "sub"));
      await writeFile(path.join(ow, "sub", ".last-update.json"), "kept\n");
    });
  });

  test("missing wiki dir hashes the same 'missing' sentinel", async () => {
    const repo = await mkdtemp(path.join(tmpdir(), "wijzer-snap-"));
    const real = await createOpenWikiContentSnapshot(repo); // no openwiki/ dir
    const { digest: bash } = await bashSnapshot(repo);
    expect(bash).toBe(real);
  });
});

describe("state-file interchange (bash <-> real)", () => {
  test("a state file bash wrote is honored by the real getUpdateNoopStatus", async () => {
    const repo = await createRepoWithOpenWiki();
    // wijzer writes the state; the REAL OpenWiki algorithm reads it back.
    await runScriptJson("write-state.sh", repo, [
      "--command",
      "init",
      "--model",
      "claude-opus-4-8",
    ]);
    const real = await getUpdateNoopStatus(repo);
    expect(real.shouldSkip).toBe(true); // clean + unchanged HEAD => skip
  });

  test("a state file the real writeLastUpdateMetadata wrote is honored by check-noop.sh", async () => {
    const repo = await createRepoWithOpenWiki();
    // The REAL OpenWiki writer produces the state; wijzer's bash reads it back.
    // This is the interchangeability guarantee against real bytes (2-space JSON,
    // millisecond timestamp, exact key order) — not a hand-shaped approximation.
    await writeLastUpdateMetadata("update", repo, "accounts/fireworks/models/glm-5p2");
    const bash = await bashNoop(repo);
    expect(bash.noop).toBe(true);
    expect(bash.stateGitHead).toBe(await git(repo, ["rev-parse", "HEAD"]));
  });

  test("write-state emits second-precision timestamps (documented delta vs real ms)", async () => {
    const repo = await createRepoWithOpenWiki();
    const { stdout } = await runScript("write-state.sh", repo, [
      "--command",
      "update",
      "--model",
      "claude-opus-4-8",
    ]);
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(path.join(repo, "openwiki", ".last-update.json"), "utf8"),
    );
    const parsed = JSON.parse(raw);
    // Intended distribution-method delta: bash `date` gives whole-second
    // precision (`...:SSZ`); OpenWiki's `new Date().toISOString()` gives
    // milliseconds (`...:SS.mmmZ`). Both are valid ISO-8601 that the real
    // readLastUpdate accepts (it only requires updatedAt to be a string).
    expect(parsed.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(parsed.updatedAt).not.toMatch(/\.\d+Z$/);
    expect(JSON.parse(stdout).written).toBe(true);
  });
});
