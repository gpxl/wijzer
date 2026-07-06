import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createRepoWithOpenWiki, runScriptJson } from "./helpers/fixtures.ts";

type Snapshot = { digest: string; files: number; present: boolean };

const snap = (repo: string) => runScriptJson<Snapshot>("snapshot.sh", repo);

describe("snapshot.sh", () => {
  test("is deterministic across repeated runs", async () => {
    const repo = await createRepoWithOpenWiki();
    const a = await snap(repo);
    const b = await snap(repo);
    expect(a.digest).toBe(b.digest);
    expect(a.files).toBe(1);
    expect(a.present).toBe(true);
  });

  test("ignores the .last-update.json metadata file", async () => {
    const repo = await createRepoWithOpenWiki();
    const before = await snap(repo);
    // Writing/altering the metadata file must not change the content digest.
    await writeFile(
      path.join(repo, "openwiki", ".last-update.json"),
      `${JSON.stringify({ updatedAt: "x", command: "init", model: "m" })}\n`,
      "utf8",
    );
    const after = await snap(repo);
    expect(after.digest).toBe(before.digest);
    expect(after.files).toBe(1);
  });

  test("changes when a page's content changes", async () => {
    const repo = await createRepoWithOpenWiki();
    const before = await snap(repo);
    await writeFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "# Quickstart\nNew content\n",
      "utf8",
    );
    const after = await snap(repo);
    expect(after.digest).not.toBe(before.digest);
  });

  test("changes when a page is added, and is order-independent", async () => {
    const repo = await createRepoWithOpenWiki();
    const before = await snap(repo);

    await mkdir(path.join(repo, "openwiki", "architecture"));
    await writeFile(
      path.join(repo, "openwiki", "architecture", "overview.md"),
      "# Overview\n",
      "utf8",
    );
    const after = await snap(repo);
    expect(after.digest).not.toBe(before.digest);
    expect(after.files).toBe(2);

    // Removing it returns to the original digest — proves the digest depends on
    // content, not on filesystem enumeration order or history.
    await rm(path.join(repo, "openwiki", "architecture"), { recursive: true });
    const restored = await snap(repo);
    expect(restored.digest).toBe(before.digest);
  });

  test("reports a sentinel for a repo with no wiki", async () => {
    const repo = await createRepoWithOpenWiki();
    await rm(path.join(repo, "openwiki"), { recursive: true });
    const s = await snap(repo);
    expect(s.present).toBe(false);
    expect(s.files).toBe(0);
    expect(s.digest).toMatch(/^[a-f0-9]{64}$/);
  });
});
