import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createRepoWithOpenWiki,
  runScript,
  runScriptJson,
} from "./helpers/fixtures.ts";

// check-format.sh is a parity-enforcement gate: it verifies an openwiki/ folder
// conforms to references/wiki-format.md (the OpenWiki format contract) before
// the init/update skills write state. These tests exercise the verdict object
// — every hard parity violation must surface as a `problem`, soft observations
// as `warnings`, and a missing openwiki/ dir as a precondition failure (exit 2).

type Verdict = {
  ok: boolean;
  pages: number;
  problems: string[];
  warnings: string[];
};

const check = (repo: string) =>
  runScriptJson<Verdict>("check-format.sh", repo);

/** Overwrite a page in openwiki/, creating parent dirs as needed. */
async function writePage(
  repo: string,
  rel: string,
  content: string,
): Promise<void> {
  const full = path.join(repo, "openwiki", rel);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
}

/** A well-formed quickstart with the two required linking headings. */
const QUICKSTART_OK = [
  "# Quickstart",
  "",
  "What this repository does.",
  "",
  "## Start here",
  "",
  "- [Architecture overview](./architecture/overview.md) — the big picture",
  "",
  "## Documentation map",
  "",
  "- Architecture → ./architecture/overview.md",
  "",
].join("\n");

/** A well-formed section page: H1 first, resolving links, valid source map. */
const OVERVIEW_OK = [
  "# Architecture overview",
  "",
  "Intro paragraph.",
  "",
  "## Details",
  "",
  "Back to [home](../quickstart.md).",
  "",
  "## Source map",
  "",
  "- `src/a.ts`",
  "- Git evidence: commits `ceded10`, `f89b05d`",
  "",
].join("\n");

describe("check-format.sh", () => {
  test("a well-formed multi-page wiki reports ok with no problems", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", QUICKSTART_OK);
    await writePage(repo, "architecture/overview.md", OVERVIEW_OK);

    const v = await check(repo);
    expect(v.ok).toBe(true);
    expect(v.pages).toBe(2);
    expect(v.problems).toEqual([]);
  });

  test("a YAML-frontmatter page is a problem (first line must be an H1)", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(
      repo,
      "quickstart.md",
      "---\ntitle: Quickstart\n---\n# Quickstart\n",
    );
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /quickstart\.md/.test(p) && /---|frontmatter/.test(p))).toBe(true);
  });

  test("a page whose first line is not an H1 is a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", "Not a heading\n# Quickstart\n");
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(
      v.problems.some((p) => /quickstart\.md/.test(p) && /level-1 heading/.test(p)),
    ).toBe(true);
  });

  test("a broken relative link is a problem; a resolving one is not", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", QUICKSTART_OK);
    await writePage(
      repo,
      "architecture/overview.md",
      "# Architecture overview\n\nSee [gone](./missing.md) and [home](../quickstart.md).\n",
    );
    const v = await check(repo);
    expect(v.ok).toBe(false);
    const brokenLinkProblems = v.problems.filter((p) => /broken relative link/.test(p));
    expect(brokenLinkProblems.length).toBe(1);
    expect(brokenLinkProblems[0]).toContain("./missing.md");
  });

  test("external and anchor links are ignored, not flagged", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(
      repo,
      "quickstart.md",
      "# Quickstart\n\nSee [ext](https://example.com/x) and [top](#start).\n",
    );
    const v = await check(repo);
    expect(v.ok).toBe(true);
    expect(v.problems).toEqual([]);
  });

  test("a Git evidence bullet with a 40-char hash is a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", QUICKSTART_OK);
    await writePage(
      repo,
      "architecture/overview.md",
      [
        "# Architecture overview",
        "",
        "[home](../quickstart.md)",
        "",
        "## Source map",
        "",
        "- `src/a.ts`",
        "- Git evidence: commits `abcdef0123456789abcdef0123456789abcdef01`",
        "",
      ].join("\n"),
    );
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /malformed 'Git evidence:'/.test(p))).toBe(true);
  });

  test("a Git evidence bullet missing backticks is a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", QUICKSTART_OK);
    await writePage(
      repo,
      "architecture/overview.md",
      [
        "# Architecture overview",
        "",
        "[home](../quickstart.md)",
        "",
        "## Source map",
        "",
        "- `src/a.ts`",
        "- Git evidence: commits ceded10",
        "",
      ].join("\n"),
    );
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /malformed 'Git evidence:'/.test(p))).toBe(true);
  });

  test("a Git evidence bullet that is not the last bullet is a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", QUICKSTART_OK);
    await writePage(
      repo,
      "architecture/overview.md",
      [
        "# Architecture overview",
        "",
        "[home](../quickstart.md)",
        "",
        "## Source map",
        "",
        "- Git evidence: commits `ceded10`",
        "- `src/a.ts`",
        "",
      ].join("\n"),
    );
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /not the last bullet/.test(p))).toBe(true);
  });

  test("a mis-cased source-map heading is a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", QUICKSTART_OK);
    await writePage(
      repo,
      "architecture/overview.md",
      [
        "# Architecture overview",
        "",
        "[home](../quickstart.md)",
        "",
        "## Source Map",
        "",
        "- `src/a.ts`",
        "",
      ].join("\n"),
    );
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /mis-cased source-map heading/.test(p))).toBe(true);
  });

  test("a leftover _plan.md is a problem and is not counted as a page", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", "# Quickstart\n");
    await writePage(repo, "_plan.md", "# Plan\n");
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.pages).toBe(1);
    expect(v.problems.some((p) => /_plan\.md is still present/.test(p))).toBe(true);
  });

  test("2+ pages without '## Start here' / '## Documentation map' is a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(repo, "quickstart.md", "# Quickstart\n\nNo linking headings.\n");
    await writePage(repo, "architecture/overview.md", "# Architecture overview\n");
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /Start here/.test(p))).toBe(true);
    expect(v.problems.some((p) => /Documentation map/.test(p))).toBe(true);
  });

  test("a missing quickstart.md is a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await rm(path.join(repo, "openwiki", "quickstart.md"));
    await writePage(repo, "architecture/overview.md", "# Architecture overview\n");
    const v = await check(repo);
    expect(v.ok).toBe(false);
    expect(v.problems.some((p) => /quickstart\.md is missing/.test(p))).toBe(true);
  });

  test("nine well-formed pages report ok with the soft-ceiling warning", async () => {
    const repo = await createRepoWithOpenWiki();
    // Quickstart with linking headings but no dangling links (the section pages
    // it would link to are validated for existence by the checker).
    await writePage(
      repo,
      "quickstart.md",
      "# Quickstart\n\n## Start here\n\n- [Page 1](./topic/p1.md) — first\n\n## Documentation map\n\n- Topic → ./topic/p1.md\n",
    );
    // Add 8 valid section pages (9 total) to cross the soft ceiling of 8.
    for (let i = 1; i <= 8; i++) {
      await writePage(repo, `topic/p${i}.md`, `# Page ${i}\n`);
    }
    const v = await check(repo);
    expect(v.ok).toBe(true);
    expect(v.pages).toBe(9);
    expect(v.warnings.some((w) => /soft init ceiling is 8/.test(w))).toBe(true);
  });

  test("a non-quickstart page at the wiki root is a warning, not a problem", async () => {
    const repo = await createRepoWithOpenWiki();
    await writePage(
      repo,
      "quickstart.md",
      "# Quickstart\n\n## Start here\n\n- [Real](./topic/real.md) — a page\n\n## Documentation map\n\n- Topic → ./topic/real.md\n",
    );
    await writePage(repo, "stray.md", "# Stray\n");
    await writePage(repo, "topic/real.md", "# Real\n");
    const v = await check(repo);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => /stray\.md.*wiki root/.test(w))).toBe(true);
  });

  test("a repo with no openwiki/ dir fails the precondition (exit 2)", async () => {
    const repo = await createRepoWithOpenWiki();
    await rm(path.join(repo, "openwiki"), { recursive: true });
    const { code, stderr } = await runScript("check-format.sh", repo);
    expect(code).toBe(2);
    expect(stderr).toMatch(/openwiki does not exist/);
  });
});
