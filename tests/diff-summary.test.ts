import { writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createRepoWithOpenWiki,
  git,
  runScriptJson,
  writeLastUpdate,
} from "./helpers/fixtures.ts";

type File = { status: string; path: string };
type DiffSummary = {
  stateGitHead: string;
  currentHead: string;
  commitsSince: number;
  changedFiles: number;
  sourceChanged: boolean;
  worktreeDirty: boolean;
  commits: { sha: string; subject: string }[];
  files: File[];
};

const diff = (repo: string) => runScriptJson<DiffSummary>("diff-summary.sh", repo);

describe("diff-summary.sh", () => {
  test("reports the correct commit range since the last state", async () => {
    const repo = await createRepoWithOpenWiki();
    const base = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, base);

    await writeFile(path.join(repo, "README.md"), "# Test Repo\nA\n", "utf8");
    await git(repo, ["add", "README.md"]);
    await git(repo, ["commit", "-m", "change one"]);
    await writeFile(path.join(repo, "src.txt"), "code\n", "utf8");
    await git(repo, ["add", "src.txt"]);
    await git(repo, ["commit", "-m", "change two"]);

    const d = await diff(repo);
    expect(d.stateGitHead).toBe(base);
    expect(d.commitsSince).toBe(2);
    expect(d.commits.map((c) => c.subject)).toEqual(["change two", "change one"]);
    expect(d.changedFiles).toBe(2);
    expect(d.sourceChanged).toBe(true);
    expect(d.files.map((f) => f.path).sort()).toEqual(["README.md", "src.txt"]);
  });

  test("marks sourceChanged false when only openwiki/ changed", async () => {
    const repo = await createRepoWithOpenWiki();
    const base = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, base);

    await writeFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "# Quickstart\nrev\n",
      "utf8",
    );
    await git(repo, ["add", "openwiki/quickstart.md"]);
    await git(repo, ["commit", "-m", "docs only"]);

    const d = await diff(repo);
    expect(d.changedFiles).toBe(1);
    expect(d.sourceChanged).toBe(false);
    expect(d.files[0].path).toBe("openwiki/quickstart.md");
  });

  test("detects an uncommitted worktree change", async () => {
    const repo = await createRepoWithOpenWiki();
    const base = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, base);
    await writeFile(path.join(repo, "README.md"), "# Test Repo\ndirty\n", "utf8");

    const d = await diff(repo);
    expect(d.worktreeDirty).toBe(true);
    expect(d.commitsSince).toBe(0);
  });

  test("handles no prior state gracefully", async () => {
    const repo = await createRepoWithOpenWiki();
    const d = await diff(repo);
    expect(d.stateGitHead).toBe("");
    expect(d.commitsSince).toBe(0);
    expect(d.commits).toEqual([]);
    expect(d.files).toEqual([]);
  });

  test("preserves quotes/unicode in commit subjects (valid JSON)", async () => {
    const repo = await createRepoWithOpenWiki();
    const base = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, base);
    await writeFile(path.join(repo, "README.md"), "# Test Repo\nx\n", "utf8");
    await git(repo, ["add", "README.md"]);
    await git(repo, ["commit", "-m", 'feat: add "quoted" — café']);

    const d = await diff(repo);
    expect(d.commits[0].subject).toBe('feat: add "quoted" — café');
  });
});
