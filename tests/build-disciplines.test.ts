import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  assertNoResidualVocab,
  generate,
  splitSections,
  substitute,
} from "../scripts/build-disciplines.mjs";

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

// The drift-lock above only proves the guards do not fire on TODAY's prompt.ts.
// These tests prove each guard actually THROWS when upstream drifts in the way it
// is meant to catch — otherwise a silently-broken guard would let a real OpenWiki
// change slip through with a byte-identical regenerate (see the silent-drop case).
// They drive the guards through the generator's own exported parsing functions
// with crafted source strings, so no fixture repo is needed.
describe("generator guards fail loudly on prompt.ts drift (error paths)", () => {
  const CONSTS = {
    OPEN_WIKI_DIR: "openwiki",
    UPDATE_METADATA_PATH: "openwiki/.last-update.json",
  };

  // The vendored system-prompt section headers, in order. Kept here (not imported)
  // so a test that reorders/renames/drops one is expressing the drift explicitly.
  const SECTION_HEADERS = [
    "Run discipline:",
    "Subagent discipline:",
    "Planning discipline:",
    "Git discipline:",
    "Existing documentation discipline:",
    "Root agent instruction files:",
    "OpenWiki CLI reference:",
    "Security and privacy rules:",
    "Documentation goals:",
    "Section quality rules:",
    "Required documentation structure:",
    "Mode-specific behavior:",
  ];

  // Build a minimal-but-valid system prompt: an intro then every header in order.
  // Each header (except the empty "Mode-specific behavior:" placeholder) gets one
  // benign body line that is deliberately NOT header-shaped (no trailing colon),
  // so it is never mistaken for a section. `overrides` swaps a header's body,
  // letting a negative test inject a stray header-shaped line into one bucket.
  function buildSystemPrompt(
    headers: string[] = SECTION_HEADERS,
    overrides: Record<string, string[]> = {},
  ): string {
    const lines = ["Intro paragraph one.", "Intro paragraph two.", ""];
    for (const h of headers) {
      lines.push(h);
      const fallback = h === "Mode-specific behavior:" ? [] : ["Guidance for this section."];
      for (const b of overrides[h] ?? fallback) lines.push(b);
    }
    return lines.join("\n");
  }

  // --- substitute: unhandled-interpolation guard ---

  test("substitute resolves the known ${...} interpolations without throwing", () => {
    const out = substitute(
      "dir=${OPEN_WIKI_DIR} meta=${UPDATE_METADATA_PATH} mode=${createModeInstructions(command)}",
      CONSTS,
    );
    expect(out).toBe("dir=openwiki meta=openwiki/.last-update.json mode=");
  });

  test("substitute throws on an unknown ${...} interpolation (new upstream dynamic piece)", () => {
    expect(() => substitute("start ${mysteryDynamicPiece} end", CONSTS)).toThrow(
      /unhandled interpolation in prompt\.ts: \$\{mysteryDynamicPiece\}/,
    );
  });

  // --- splitSections: baseline proving the fixture is well-formed ---

  test("splitSections accepts the well-formed fixture (baseline for the negatives)", () => {
    const { intro, sections } = splitSections(buildSystemPrompt());
    expect(intro).toBe("Intro paragraph one.\nIntro paragraph two.");
    expect(sections["Run discipline:"]).toBe("Guidance for this section.");
    // The mode placeholder must parse as empty — its body is composed elsewhere.
    expect(sections["Mode-specific behavior:"]).toBe("");
  });

  // --- splitSections: silent-drop guard (the most important one) ---

  test("splitSections throws when a new section is absorbed into the dropped CLI bucket", () => {
    // A brand-new upstream header lands inside "OpenWiki CLI reference:" (a bucket
    // wijzer drops). The known-header set can't see it, so WITHOUT this guard the
    // new doctrine silently vanishes and a fresh regenerate stays byte-identical —
    // the drift-lock would stay green while a discipline was lost.
    const prompt = buildSystemPrompt(SECTION_HEADERS, {
      "OpenWiki CLI reference:": ["Guidance for this section.", "Telemetry discipline:"],
    });
    expect(() => splitSections(prompt)).toThrow(
      /possible new upstream section "Telemetry discipline:" absorbed into the unrendered "OpenWiki CLI reference:" bucket/,
    );
  });

  test("splitSections throws when content follows the Mode-specific behavior placeholder", () => {
    // Same silent-drop family: new upstream text after the mode interpolation
    // would be swallowed by the placeholder that wijzer composes itself.
    const prompt = buildSystemPrompt(SECTION_HEADERS, {
      "Mode-specific behavior:": ["An extra upstream paragraph."],
    });
    expect(() => splitSections(prompt)).toThrow(
      /content follows 'Mode-specific behavior:' beyond the mode interpolation/,
    );
  });

  // --- splitSections: section-header drift guard (renamed / reordered / missing) ---

  test("splitSections throws when a header is renamed", () => {
    const renamed = SECTION_HEADERS.map((h) =>
      h === "Git discipline:" ? "Version-control discipline:" : h,
    );
    expect(() => splitSections(buildSystemPrompt(renamed))).toThrow(/section headers drifted/);
  });

  test("splitSections throws when headers are reordered", () => {
    const reordered = [...SECTION_HEADERS];
    // Swap "Planning discipline:" and "Git discipline:".
    [reordered[2], reordered[3]] = [reordered[3], reordered[2]];
    expect(() => splitSections(buildSystemPrompt(reordered))).toThrow(/section headers drifted/);
  });

  test("splitSections throws when a header is dropped entirely", () => {
    const missing = SECTION_HEADERS.filter((h) => h !== "Security and privacy rules:");
    expect(() => splitSections(buildSystemPrompt(missing))).toThrow(/section headers drifted/);
  });

  // --- assertNoResidualVocab: residual DeepAgents vocabulary guard ---

  test("assertNoResidualVocab throws when DeepAgents vocabulary survives translation", () => {
    expect(() =>
      assertNoResidualVocab("Use read_file to open the page.", "disciplines.md"),
    ).toThrow(/untranslated DeepAgents vocabulary "read_file" survived in disciplines\.md/);
  });

  test("assertNoResidualVocab passes when only real Claude Code tools remain", () => {
    expect(() =>
      assertNoResidualVocab("Use `Read` and `Write` on repository-relative paths.", "disciplines.md"),
    ).not.toThrow();
  });

  // --- generate: mode-template count guard ---

  test("generate throws when createModeInstructions no longer returns exactly 3 templates", () => {
    // Inject a prompt.ts whose createModeInstructions returns 2 templates (an
    // upstream mode was added or removed). Everything before the count check must
    // succeed, so the crafted source also carries a createSystemPrompt template
    // and the two constants.
    const promptSrc = [
      "export function createSystemPrompt(command) {",
      "  return `A system prompt body without sections.`;",
      "}",
      "export function createModeInstructions(command) {",
      "  return `chat mode text`;",
      "  return `init mode text`;", // only 2 — the update mode is gone
      "}",
    ].join("\n");
    const constantsSrc = [
      'export const OPEN_WIKI_DIR = "openwiki";',
      "export const UPDATE_METADATA_PATH = `${OPEN_WIKI_DIR}/.last-update.json`;",
    ].join("\n");
    const provenance = `Pinned at ${"a".repeat(40)}.`;
    expect(() => generate({ promptSrc, constantsSrc, provenance })).toThrow(
      /expected 3 mode templates \(chat, init, update\), found 2/,
    );
  });
});
