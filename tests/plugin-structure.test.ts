import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// Structural integrity of the plugin surface (skills, agent, references,
// examples, workflows). These are markdown/YAML, not scripts, so they can't be
// exercised behaviorally without a live model — but their contract CAN be
// checked: that every skill points at a script/reference that actually exists,
// that read-only commands stay read-only, and that the parity-load-bearing
// literals are present. If someone renames a script or breaks a reference, this
// suite fails.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...parts: string[]) => path.join(ROOT, ...parts);
const read = (...parts: string[]) => readFile(p(...parts), "utf8");

/** Minimal front-matter split: returns { frontmatter, body }. */
function splitFrontmatter(md: string): { fm: string; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("no YAML frontmatter found");
  return { fm: m[1], body: m[2] };
}

/** Read a single `key: value` line out of a frontmatter block. */
function fmField(fm: string, key: string): string | undefined {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return m ? m[1].trim() : undefined;
}

const SKILLS = ["init", "update", "ask"] as const;

describe("plugin manifests", () => {
  test("plugin.json and marketplace.json are valid and name the plugin 'wijzer'", async () => {
    const plugin = JSON.parse(await read(".claude-plugin", "plugin.json"));
    expect(plugin.name).toBe("wijzer");

    const market = JSON.parse(await read(".claude-plugin", "marketplace.json"));
    expect(market.name).toBe("wijzer");
    // The one advertised plugin resolves to the repo root.
    const names = market.plugins.map((x: { name: string }) => x.name);
    expect(names).toContain("wijzer");
  });
});

describe("skills", () => {
  for (const name of SKILLS) {
    test(`skills/${name}/SKILL.md has a well-formed, user-invocable frontmatter`, async () => {
      const md = await read("skills", name, "SKILL.md");
      const { fm } = splitFrontmatter(md);
      // name matches the directory so it namespaces as /wijzer:<name>.
      expect(fmField(fm, "name")).toBe(name);
      expect(fmField(fm, "description")).toBeTruthy();
      // User-only: never auto-triggered by the model.
      expect(fmField(fm, "disable-model-invocation")).toBe("true");
      expect(fmField(fm, "argument-hint")).toBeTruthy();
    });
  }

  test("every ${CLAUDE_PLUGIN_ROOT} path a skill references resolves to a real file", async () => {
    const all: string[] = [];
    for (const name of SKILLS) {
      const md = await read("skills", name, "SKILL.md");
      const refs = [
        ...md.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"'`)]+)/g),
      ]
        .map((m) => m[1])
        .filter((r) => !r.includes("*")); // skip allowed-tools globs
      for (const rel of refs) {
        expect(existsSync(p(rel)), `${name} references missing ${rel}`).toBe(
          true,
        );
      }
      all.push(...refs);
    }
    // init + update wire the deterministic scripts and doctrine; ask reads only
    // openwiki/ and references nothing bundled — so the *set* must be non-empty
    // even though not every skill contributes.
    expect(all.length).toBeGreaterThan(0);
  });

  test("ask is structurally read-only (no write/edit/bash tools)", async () => {
    const md = await read("skills", "ask", "SKILL.md");
    const { fm } = splitFrontmatter(md);
    const allowed = fmField(fm, "allowed-tools") ?? "";
    expect(allowed).not.toMatch(/\bWrite\b/);
    expect(allowed).not.toMatch(/\bEdit\b/);
    expect(allowed).not.toMatch(/\bBash\b/);
  });

  test("update exposes a --dry-run affordance", async () => {
    const md = await read("skills", "update", "SKILL.md");
    expect(md).toContain("--dry-run");
  });

  // The write-capable skills may run git only for read-only history inspection.
  // Their allowed-tools must NOT carry a broad `Bash(git *)` / `Bash(git:*)`
  // catch-all that would let the model run `git commit`/`git push`/`git checkout`
  // directly — those belong to the agent pipeline, not the skill. This locks the
  // doctrine so a future edit can't silently re-widen the git allowlist.
  for (const name of ["init", "update"] as const) {
    test(`${name} allowed-tools has no broad git catch-all and cannot commit/push`, async () => {
      const md = await read("skills", name, "SKILL.md");
      const { fm } = splitFrontmatter(md);
      const allowed = fmField(fm, "allowed-tools") ?? "";
      // No wildcard-only git grant in either specifier style.
      expect(allowed).not.toMatch(/Bash\(git\s*\*\)/); // `Bash(git *)`
      expect(allowed).not.toMatch(/Bash\(git:\*\)/); // `Bash(git:*)`
      // No mutating git subcommand is granted.
      expect(allowed).not.toMatch(/Bash\(git commit/);
      expect(allowed).not.toMatch(/Bash\(git push/);
      expect(allowed).not.toMatch(/Bash\(git checkout/);
      // The read-only subset the disciplines actually need is present.
      expect(allowed).toMatch(/Bash\(git log:\*\)/);
      expect(allowed).toMatch(/Bash\(git show:\*\)/);
    });
  }
});

describe("wiki-scout agent", () => {
  test("exists, is named wiki-scout, and cannot write", async () => {
    const md = await read("agents", "wiki-scout.md");
    const { fm } = splitFrontmatter(md);
    expect(fmField(fm, "name")).toBe("wiki-scout");
    const tools = fmField(fm, "tools") ?? "";
    expect(tools).not.toMatch(/\bWrite\b/);
    expect(tools).not.toMatch(/\bEdit\b/);
  });

  test("runs on the durable 'sonnet' model alias, not a pinned dated id", async () => {
    const md = await read("agents", "wiki-scout.md");
    const { fm } = splitFrontmatter(md);
    // Durable alias so the scout tracks the current Sonnet without a version bump.
    expect(fmField(fm, "model")).toBe("sonnet");
  });

  test("its Bash use is bounded to non-mutating commands by the agent prose", async () => {
    // Agent `tools:` frontmatter accepts only bare tool names — it cannot carry
    // per-command permission specifiers like a skill's allowed-tools can — so
    // the scout lists a bare `Bash`. The enforcement that keeps it read-only is
    // the explicit non-mutation contract in its body, which this asserts stays
    // present (and that no write tools leaked into `tools:`).
    const md = await read("agents", "wiki-scout.md");
    const { fm, body } = splitFrontmatter(md);
    const tools = fmField(fm, "tools") ?? "";
    expect(tools).not.toMatch(/\bWrite\b/);
    expect(tools).not.toMatch(/\bEdit\b/);
    // The body must forbid the mutating git operations and file writes.
    expect(body).toMatch(/Read-only/);
    expect(body).toMatch(/git add\/commit\/checkout/);
    expect(body).toMatch(/non-mutating/);
  });
});

describe("reference doctrine", () => {
  test("the three reference docs exist", () => {
    for (const f of ["wiki-format.md", "disciplines.md", "state-schema.md"]) {
      expect(existsSync(p("references", f)), `missing references/${f}`).toBe(
        true,
      );
    }
  });

  test("wiki-format.md encodes the parity-load-bearing literals", async () => {
    const md = await read("references", "wiki-format.md");
    expect(md).toContain("openwiki/quickstart.md");
    expect(md).toContain("## Source map");
    expect(md).toContain("Git evidence: commits");
    expect(md).toMatch(/at most\s+\*?\*?8/); // ≤8 pages init ceiling
  });

  test("disciplines.md keeps the surgical-edit budget numbers", async () => {
    const md = await read("references", "disciplines.md");
    // "fewer than ~5 changed files → at most 1–2 pages"
    expect(md).toMatch(/\b5\b/);
    expect(md).toMatch(/1[–-]2/);
  });
});

describe("integration surface", () => {
  test("examples and the parity-watch workflow are present", () => {
    expect(existsSync(p("examples", "github-action.yml"))).toBe(true);
    expect(existsSync(p("examples", "headless.md"))).toBe(true);
    expect(existsSync(p(".github", "workflows", "parity-watch.yml"))).toBe(true);
  });

  test("parity-watch pins the same upstream SHA as PARITY.md", async () => {
    const wf = await read(".github", "workflows", "parity-watch.yml");
    const parity = await read("PARITY.md");
    const pin = wf.match(/PINNED_SHA:\s*([0-9a-f]{40})/)?.[1];
    expect(pin, "parity-watch.yml has no PINNED_SHA").toBeTruthy();
    expect(parity, "PARITY.md lost its pin").toContain(pin as string);
  });
});
