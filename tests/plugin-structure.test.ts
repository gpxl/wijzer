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

  // Discovery metadata (keywords, license, repository, homepage, description) is
  // declared in BOTH .claude-plugin/plugin.json and the marketplace.json plugin
  // entry. Claude Code reads the marketplace entry for the browse/discovery
  // listing and plugin.json for the installed plugin — for a local-path plugin
  // (`source: "./"`) neither inherits from the other — so the duplication is
  // platform-required and can't be deduped. What it can't carry on its own is a
  // drift guard: this repo already drift-locks duplicated content elsewhere
  // (references/ docs derived from the vendored prompt, pinned by
  // build-disciplines.test), and the two discovery surfaces get the same
  // treatment here so a metadata edit to one manifest can't silently diverge the
  // other.
  test("marketplace entry and plugin.json agree on shared discovery metadata", async () => {
    const plugin = JSON.parse(await read(".claude-plugin", "plugin.json"));
    const market = JSON.parse(await read(".claude-plugin", "marketplace.json"));
    const entry = market.plugins.find(
      (x: { name: string }) => x.name === "wijzer",
    );
    expect(entry, "marketplace.json has no 'wijzer' plugin entry").toBeTruthy();

    // These must be byte-identical or the browse listing drifts from the
    // installed plugin.
    expect(entry.homepage).toBe(plugin.homepage);
    expect(entry.repository).toBe(plugin.repository);
    expect(entry.license).toBe(plugin.license);
    expect(entry.keywords).toEqual(plugin.keywords);

    // The entry description is the canonical plugin.json description minus its
    // trailing command-list sentence, so plugin.json's must start with it. This
    // catches a wording change to one that isn't mirrored in the other.
    expect(
      plugin.description.startsWith(entry.description),
      "plugin.json description must extend the marketplace entry description",
    ).toBe(true);
  });

  // package.json is the third manifest carrying the same discovery keywords, plus
  // npm-flavoured extras (claude-code, claude-code-plugin, agents). It's a
  // superset by design, but the shared keys must not drift: every keyword the
  // plugin manifests advertise has to exist in package.json too, and the license
  // is one value across all three, or the distribution channels disagree about
  // what the plugin is.
  test("package.json is a consistent superset of the plugin manifest metadata", async () => {
    const pkg = JSON.parse(await read("package.json"));
    const plugin = JSON.parse(await read(".claude-plugin", "plugin.json"));
    for (const kw of plugin.keywords as string[]) {
      expect(
        pkg.keywords,
        `package.json keywords missing '${kw}' advertised by the plugin manifests`,
      ).toContain(kw);
    }
    expect(pkg.license).toBe(plugin.license);
  });

  // All descriptions are hand-written prose for different surfaces (npm package,
  // installed plugin, marketplace catalog, marketplace entry) so they legitimately
  // differ in length and framing — but none may drift into describing a
  // *different* product. Lock the load-bearing identity phrases so a careless
  // rewrite of one can't silently diverge from the others.
  test("every manifest description names the OpenWiki wiki and the subscription", async () => {
    const pkg = JSON.parse(await read("package.json"));
    const plugin = JSON.parse(await read(".claude-plugin", "plugin.json"));
    const market = JSON.parse(await read(".claude-plugin", "marketplace.json"));
    const entry = market.plugins.find(
      (x: { name: string }) => x.name === "wijzer",
    );
    for (const desc of [
      pkg.description,
      plugin.description,
      market.description,
      entry.description,
    ] as string[]) {
      expect(desc).toMatch(/OpenWiki-format agent wiki/);
      expect(desc).toMatch(/Claude subscription/);
    }
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

  test("P2D: the removed value-add scripts stay gone and unreferenced", async () => {
    // inventory/inject-pointer/diff-summary had no OpenWiki counterpart; P2D made
    // discovery, the pointer, and git inspection prompt-driven. Guard against a
    // regression that reintroduces a script or a skill reference to one.
    const removed = ["inventory.sh", "inject-pointer.sh", "diff-summary.sh"];
    for (const s of removed) {
      expect(existsSync(p("scripts", s)), `scripts/${s} should be removed`).toBe(false);
    }
    for (const name of SKILLS) {
      const md = await read("skills", name, "SKILL.md");
      for (const s of removed) {
        expect(md, `skills/${name} still references ${s}`).not.toContain(s);
      }
    }
  });

  test("init/update discover and write the pointer prompt-driven (no bash injector)", async () => {
    for (const name of ["init", "update"] as const) {
      const md = await read("skills", name, "SKILL.md");
      expect(md, `${name} should be prompt-driven`).toMatch(/prompt-driven/i);
      // The pointer step names the exact ## OpenWiki section, not a script.
      expect(md).toContain("## OpenWiki");
    }
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

  // Parity-first (wj-1s6): we do NOT re-assert that wijzer's own docs restate the
  // OpenWiki spec values here — that would test wijzer's restatement, not parity.
  // The spec values are guarded where they are actually derived/enforced:
  //   - the ≤8-page ceiling and the <5-files→1–2-pages budget: pinned in
  //     tests/build-disciplines.test.ts ("parity numbers survive derivation"),
  //     against docs drift-locked to the vendored prompt.ts;
  //   - the `## Source map` heading and `Git evidence: commits` bullet: enforced
  //     and tested in tests/check-format.test.ts (the format gate).
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
