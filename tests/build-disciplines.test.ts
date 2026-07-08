import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { generate } from "../scripts/build-disciplines.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

/**
 * The derived doctrine only: between the generated header comment (which cites
 * the legitimate `vendor/openwiki/...` source path) and the "## How this file is
 * generated" appendix (which quotes the pre-translation vocabulary verbatim).
 * Residual-vocab checks run against this slice, not the boilerplate around it.
 */
function body(markdown: string): string {
  const afterHeader = markdown.slice(markdown.indexOf("-->") + 3);
  const marker = "\n---\n\n## How this file is generated";
  const at = afterHeader.indexOf(marker);
  return at < 0 ? afterHeader : afterHeader.slice(0, at);
}

// DeepAgents virtual-filesystem vocabulary that translation must eliminate. The
// generator asserts this on the body it produces; here we re-assert it against
// the *committed* artifact so a hand-edit that reintroduces it also fails.
const RESIDUAL_VOCAB = [
  "read_file",
  "write_file",
  "edit_file",
  "filesystem tool",
  "shell execut", // "execute" and "execution"
  "virtual path",
  "task tool",
  "/openwiki",
  "/AGENTS.md",
  "/CLAUDE.md",
  "/Users/",
];

describe("generated disciplines + wiki-format (drift-locked to prompt.ts)", () => {
  const out = generate();

  test("committed references/disciplines.md equals a fresh regenerate", () => {
    // If this fails, prompt.ts (or the generator) changed: rerun
    //   node scripts/build-disciplines.mjs
    // and review the diff against PARITY.md re-validation.
    expect(read("references/disciplines.md")).toBe(out.disciplines);
  });

  test("committed references/wiki-format.md equals a fresh regenerate", () => {
    expect(read("references/wiki-format.md")).toBe(out.wikiFormat);
  });

  test("no DeepAgents virtual-fs vocabulary survives in either doc body", () => {
    for (const rel of ["references/disciplines.md", "references/wiki-format.md"]) {
      // Fenced blocks are verbatim literals (e.g. the `## OpenWiki` pointer block,
      // which keeps OpenWiki's own `/openwiki` path); the generator exempts them,
      // so strip them here before checking translated prose.
      const text = body(read(rel)).replace(/```[\s\S]*?```/g, "");
      for (const token of RESIDUAL_VOCAB) {
        expect(text, `"${token}" leaked into ${rel}`).not.toContain(token);
      }
    }
  });

  test("the AGENTS.md/CLAUDE.md pointer block is derived verbatim (agent writes it)", () => {
    // P2D: no bash injector — the agent reproduces OpenWiki's exact block, so it
    // must appear byte-for-byte in the doctrine, including OpenWiki's `/openwiki`.
    const d = read("references/disciplines.md");
    expect(d).toContain("## Root agent instruction files");
    expect(d).toContain("This repository has documentation located in the /openwiki directory.");
    expect(d).toContain("[OpenWiki quickstart](openwiki/quickstart.md)");
    // And the old inject-pointer.sh adaptation must be gone.
    expect(d).not.toContain("inject-pointer.sh");
  });

  test("Claude Code tool vocabulary is present (translation actually fired)", () => {
    const d = read("references/disciplines.md");
    // The virtual tools became real ones.
    for (const tool of ["`Glob`", "`Grep`", "`Read`", "`Write`", "`Edit`", "`Bash`"]) {
      expect(d).toContain(tool);
    }
    // The `task` tool became the Task tool + wiki-scout subagent.
    expect(d).toContain("`Task` tool with the `wiki-scout` subagent");
  });

  test("parity numbers survive derivation (page/subagent/diff budgets)", () => {
    const d = read("references/disciplines.md");
    expect(d).toContain("at most 8 documentation pages"); // init page ceiling
    expect(d).toContain("1-2 subagents"); // subagent default
    expect(d).toContain("3-4 subagents"); // subagent upper bound
    expect(d).toContain("fewer than about 5 source files"); // update diff budget
    expect(d).toContain("update at most 1-2 wiki pages");
  });

  test("both docs pin the same upstream SHA as PARITY.md", () => {
    const pin = read("PARITY.md").match(/\b([0-9a-f]{40})\b/)?.[1];
    expect(pin).toBeDefined();
    for (const rel of ["references/disciplines.md", "references/wiki-format.md"]) {
      expect(read(rel)).toContain(pin as string);
    }
  });

  test("out-of-scope OpenWiki CLI section is dropped, not translated", () => {
    // The CLI flag surface (openwiki --init/--update/...) is not wijzer's runtime;
    // it must not appear as doctrine (only named in the drop rationale).
    expect(body(read("references/disciplines.md"))).not.toContain("openwiki --init");
    expect(body(read("references/wiki-format.md"))).not.toContain("openwiki --init");
  });
});

// state-schema.md is a DELIBERATE keep (hand-written, not generated): it documents
// wijzer-only serialization facts absent from OpenWiki's type (2-space indent,
// second-precision timestamp, atomic write, the claude-code model fallback). But
// its field SET is a parity contract, so lock it to the vendored UpdateMetadata.
describe("state-schema.md field set is locked to vendored UpdateMetadata", () => {
  function updateMetadataFields(): string[] {
    const types = read("vendor/openwiki/src/agent/types.ts");
    const block = types.match(/export type UpdateMetadata = \{([^}]*)\}/)?.[1];
    expect(block, "UpdateMetadata type not found in vendored types.ts").toBeDefined();
    return [...(block as string).matchAll(/^\s*([A-Za-z]+)\??:/gm)].map((m) => m[1]);
  }

  test("documents exactly the UpdateMetadata fields (no more, no fewer)", () => {
    const typeFields = updateMetadataFields();
    expect(typeFields.sort()).toEqual(["command", "gitHead", "model", "updatedAt"]);
    // The field-reference table in state-schema.md: rows like `| \`updatedAt\` |`.
    const schema = read("references/state-schema.md");
    const documented = [...schema.matchAll(/^\|\s*`(\w+)`\s*\|/gm)].map((m) => m[1]);
    expect(documented.length, "no field table found in state-schema.md").toBeGreaterThan(0);
    // Neither a dropped field (parity gap) nor a phantom field (fiction) may exist.
    expect([...new Set(documented)].sort()).toEqual(typeFields.sort());
  });
});
