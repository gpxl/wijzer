import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createRepoWithOpenWiki,
  git,
  runScriptJson,
  writeLastUpdate,
} from "./helpers/fixtures.ts";

// Case-for-case port of OpenWiki's test/update-noop.test.ts (MIT). The scripts
// under test are wijzer's, but the behavior spec is OpenWiki's: check-noop.sh
// reproduces getUpdateNoopStatus + shouldCheckUpdateNoop. Test names are kept
// identical for auditability against the upstream suite (see PARITY.md).

type NoopVerdict = {
  noop: boolean;
  checkNoop: boolean;
  reason: string;
  gitHead: string;
  stateGitHead: string;
  dirty: boolean;
  commitsSince: number;
};

const checkNoop = (repo: string, args: string[] = []) =>
  runScriptJson<NoopVerdict>("check-noop.sh", repo, args);

describe("getUpdateNoopStatus", () => {
  test("detects a clean update with unchanged HEAD as a no-op", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);

    const status = await checkNoop(repo);

    expect(status.noop).toBe(true);
  });

  test("does not skip update when the worktree has uncommitted changes", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);
    await writeFile(
      path.join(repo, "README.md"),
      "# Test Repo\nChanged\n",
      "utf8",
    );

    const status = await checkNoop(repo);

    expect(status.noop).toBe(false);
    expect(status.reason).toBe("worktree has changes");
    expect(status.dirty).toBe(true);
  });

  test("skips update when commits since the last run only touch OpenWiki files", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);
    await writeFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "# Quickstart\nUpdated\n",
      "utf8",
    );
    await git(repo, ["add", "openwiki/quickstart.md"]);
    await git(repo, ["commit", "-m", "update openwiki docs"]);

    const status = await checkNoop(repo);

    expect(status.noop).toBe(true);
  });

  test("does not skip update when commits since the last run touch source files", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);
    await writeFile(
      path.join(repo, "README.md"),
      "# Test Repo\nChanged\n",
      "utf8",
    );
    await git(repo, ["add", "README.md"]);
    await git(repo, ["commit", "-m", "update readme"]);

    const status = await checkNoop(repo);

    expect(status.noop).toBe(false);
    expect(status.reason).toBe("git head changed");
  });

  test("does not skip when there is no prior update metadata", async () => {
    const repo = await createRepoWithOpenWiki();

    const status = await checkNoop(repo);

    expect(status.noop).toBe(false);
    expect(status.reason).toBe("missing previous update git head");
  });
});

describe("shouldCheckUpdateNoop", () => {
  test("does not check for update no-op when an update message is provided", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);

    // A user instruction means "always run" — never short-circuit to a no-op,
    // even though HEAD is unchanged and the tree is clean.
    const status = await checkNoop(repo, ["--user-message", "document the API"]);

    expect(status.checkNoop).toBe(false);
    expect(status.noop).toBe(false);
  });

  test("checks for update no-op when no update message is provided", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head);

    const empty = await checkNoop(repo, ["--user-message", "   "]);
    expect(empty.checkNoop).toBe(true);

    const none = await checkNoop(repo);
    expect(none.checkNoop).toBe(true);
  });
});
