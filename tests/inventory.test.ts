import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createRepoWithOpenWiki, git, runScriptJson } from "./helpers/fixtures.ts";

type Inventory = {
  root: string;
  trackedFileCount: number;
  manifests: string[];
  entrypoints: string[];
  recentCommits: { sha: string; subject: string }[];
  topExtensions: { ext: string; count: number }[];
  sampleFiles: string[];
  sampleTruncated: boolean;
};

const inv = (repo: string, args: string[] = []) =>
  runScriptJson<Inventory>("inventory.sh", repo, args);

describe("inventory.sh", () => {
  test("emits valid JSON detecting manifests and entrypoints", async () => {
    const repo = await createRepoWithOpenWiki();
    await writeFile(path.join(repo, "package.json"), '{"name":"x"}\n', "utf8");
    await mkdir(path.join(repo, "src"));
    await writeFile(path.join(repo, "src", "index.ts"), "export {};\n", "utf8");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "add source"]);

    const i = await inv(repo);
    expect(i.manifests).toContain("package.json");
    expect(i.entrypoints).toContain("src/index.ts");
    expect(i.trackedFileCount).toBeGreaterThan(0);
    expect(i.recentCommits[0].subject).toBe("add source");
    expect(i.topExtensions.some((e) => e.ext === ".ts")).toBe(true);
  });

  test("honors --max-files and reports truncation", async () => {
    const repo = await createRepoWithOpenWiki();
    const i = await inv(repo, ["--max-files", "1"]);
    expect(i.sampleFiles.length).toBe(1);
    expect(i.sampleTruncated).toBe(true);
  });
});
