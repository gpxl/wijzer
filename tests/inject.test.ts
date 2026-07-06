import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { createRepoWithOpenWiki, runScriptJson } from "./helpers/fixtures.ts";

type InjectResult = { results: { file: string; action: string }[] };

const BEGIN = "<!-- BEGIN wijzer -->";

const inject = (repo: string, files: string) =>
  runScriptJson<InjectResult>("inject-pointer.sh", repo, ["--files", files]);

const countMarkers = (text: string) =>
  text.split(BEGIN).length - 1;

describe("inject-pointer.sh", () => {
  test("creates the target file when absent", async () => {
    const repo = await createRepoWithOpenWiki();
    const res = await inject(repo, "CLAUDE.md");
    expect(res.results[0]).toEqual({ file: "CLAUDE.md", action: "created" });

    const text = await readFile(path.join(repo, "CLAUDE.md"), "utf8");
    expect(text).toContain(BEGIN);
    expect(text).toContain("openwiki/quickstart.md");
  });

  test("appends to an existing file and preserves user content", async () => {
    const repo = await createRepoWithOpenWiki();
    const original = "# My Project\n\nHand-written guidance.\n";
    await writeFile(path.join(repo, "CLAUDE.md"), original, "utf8");

    const res = await inject(repo, "CLAUDE.md");
    expect(res.results[0].action).toBe("appended");

    const text = await readFile(path.join(repo, "CLAUDE.md"), "utf8");
    expect(text).toContain("Hand-written guidance.");
    expect(text).toContain(BEGIN);
    expect(text.indexOf("Hand-written guidance.")).toBeLessThan(
      text.indexOf(BEGIN),
    );
  });

  test("is idempotent: a second run does not duplicate the block", async () => {
    const repo = await createRepoWithOpenWiki();
    await inject(repo, "CLAUDE.md");
    const second = await inject(repo, "CLAUDE.md");
    expect(second.results[0].action).toBe("unchanged");

    const text = await readFile(path.join(repo, "CLAUDE.md"), "utf8");
    expect(countMarkers(text)).toBe(1);
  });

  test("handles multiple targets and reports each", async () => {
    const repo = await createRepoWithOpenWiki();
    const res = await inject(repo, "AGENTS.md,CLAUDE.md");
    const byFile = Object.fromEntries(
      res.results.map((r) => [r.file, r.action]),
    );
    expect(byFile["AGENTS.md"]).toBe("created");
    expect(byFile["CLAUDE.md"]).toBe("created");
  });
});
