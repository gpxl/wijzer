#!/usr/bin/env node
// build-disciplines.mjs — DEV / CI ONLY. Never run by the plugin or by users.
//
// Derives references/disciplines.md and references/wiki-format.md from the real,
// vendored OpenWiki system prompt (vendor/openwiki/src/agent/prompt.ts) by:
//   1. extracting the exact template-literal text of createSystemPrompt() and
//      createModeInstructions() (no TS import — plain text parsing, so this runs
//      under stock `node` with zero deps),
//   2. substituting the two prompt constants (OPEN_WIKI_DIR, UPDATE_METADATA_PATH)
//      read from vendor/openwiki/src/constants.ts,
//   3. routing the prompt's sections to disciplines.md vs wiki-format.md (or
//      dropping the ones that are out of wijzer's parity scope), and
//   4. applying a DOCUMENTED tool-vocabulary translation from OpenWiki's
//      DeepAgents virtual-filesystem vocabulary to Claude Code's real tools.
//
// The committed output is what the plugin ships, so users never run node. The
// generation is drift-locked by tests/build-disciplines.test.ts: committed files
// must equal a fresh regenerate, and OpenWiki's own drift into prompt.ts is
// caught by tests/vendor-openwiki.test.ts. When either fires, re-run this script
// and review the diff (see PARITY.md re-validation).
//
// Usage:
//   node scripts/build-disciplines.mjs            # write the generated files
//   node scripts/build-disciplines.mjs --check    # exit 1 if committed != generated

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const PROMPT_TS = path.join(REPO_ROOT, "vendor/openwiki/src/agent/prompt.ts");
const CONSTANTS_TS = path.join(REPO_ROOT, "vendor/openwiki/src/constants.ts");
const PROVENANCE = path.join(REPO_ROOT, "vendor/openwiki/PROVENANCE.md");

const OUT = {
  disciplines: path.join(REPO_ROOT, "references/disciplines.md"),
  wikiFormat: path.join(REPO_ROOT, "references/wiki-format.md"),
};

// --- Template-literal extraction ------------------------------------------

/**
 * Read the raw source between an opening backtick at `openIdx` and its matching
 * unescaped closing backtick, then "cook" it into the runtime string (undo the
 * two escapes the vendored prompt actually uses: \` and \\). Returns the cooked
 * text and the index just past the closing backtick.
 */
function readTemplate(src, openIdx) {
  let raw = "";
  let i = openIdx + 1;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      raw += src[i + 1];
      i++;
      continue;
    }
    if (ch === "`") break;
    raw += ch;
  }
  if (i >= src.length) throw new Error("unterminated template literal in prompt.ts");
  return { text: raw, end: i + 1 };
}

/** The single template literal returned by `functionName` in prompt.ts. */
function extractSingleTemplate(src, functionName) {
  const at = src.indexOf(`export function ${functionName}`);
  if (at < 0) throw new Error(`${functionName} not found in prompt.ts`);
  const ret = src.indexOf("return `", at);
  if (ret < 0) throw new Error(`no template return in ${functionName}`);
  return readTemplate(src, ret + "return ".length).text;
}

/** Every template literal returned inside `functionName`, in source order. */
function extractAllTemplates(src, functionName) {
  const at = src.indexOf(`export function ${functionName}`);
  if (at < 0) throw new Error(`${functionName} not found in prompt.ts`);
  // Bound the search to this function body (up to the next top-level export).
  const nextFn = src.indexOf("\nexport function ", at + 1);
  const end = nextFn < 0 ? src.length : nextFn;
  const out = [];
  let cursor = at;
  for (;;) {
    const ret = src.indexOf("return `", cursor);
    if (ret < 0 || ret >= end) break;
    const t = readTemplate(src, ret + "return ".length);
    out.push(t.text);
    cursor = t.end;
  }
  return out;
}

// --- Constant substitution -------------------------------------------------

function readConstants(src) {
  const dir = src.match(/OPEN_WIKI_DIR\s*=\s*"([^"]+)"/);
  if (!dir) throw new Error("OPEN_WIKI_DIR not found in constants.ts");
  const OPEN_WIKI_DIR = dir[1];
  const meta = src.match(/UPDATE_METADATA_PATH\s*=\s*`([^`]+)`/);
  if (!meta) throw new Error("UPDATE_METADATA_PATH not found in constants.ts");
  const UPDATE_METADATA_PATH = meta[1].replace("${OPEN_WIKI_DIR}", OPEN_WIKI_DIR);
  return { OPEN_WIKI_DIR, UPDATE_METADATA_PATH };
}

/**
 * Resolve every `${...}` interpolation the vendored templates use. Any unknown
 * interpolation left over is a loud failure: OpenWiki added a dynamic piece this
 * generator does not understand, so a human must extend it.
 */
function substitute(text, consts) {
  let out = text
    .replaceAll("${OPEN_WIKI_DIR}", consts.OPEN_WIKI_DIR)
    .replaceAll("${UPDATE_METADATA_PATH}", consts.UPDATE_METADATA_PATH)
    // createSystemPrompt splices the mode block in; we compose modes ourselves.
    .replaceAll("${createModeInstructions(command)}", "");
  const stray = out.match(/\$\{[^}]*\}/);
  if (stray) throw new Error(`unhandled interpolation in prompt.ts: ${stray[0]}`);
  return out;
}

// --- Tool-vocabulary translation ------------------------------------------
//
// Ordered, documented replacements: OpenWiki's DeepAgents virtual-filesystem
// vocabulary -> Claude Code's real tools and repository-relative paths. Whole
// sentences/bullets are matched verbatim (robust: an upstream edit to one makes
// this generator fail loudly rather than pass DeepAgents vocab through). The
// residual-vocabulary guard below proves the table stays complete.

const TRANSLATIONS = [
  {
    note: "Drop the OpenWiki brand from the identity line (behavioral parity, not naming).",
    from: "You are OpenWiki, an expert",
    to: "You are an expert",
  },
  {
    note: "Discovery/read/write/exec tools: ls,glob,grep,read_file,write_file,edit_file,execute -> Claude Code tools.",
    from: "Prefer built-in filesystem discovery tools such as ls, glob, grep, read_file, write_file, and edit_file for targeted reads. Use git through shell execute when it provides useful history.",
    to: "Prefer built-in discovery tools such as `Glob`, `Grep`, and `Read` for targeted reads, and `Write` and `Edit` to author pages. Use git through `Bash` when it provides useful history.",
  },
  {
    note: "Virtual filesystem rooting + virtual paths -> repository-relative paths and Claude Code tools.",
    from: "Filesystem tools are rooted at the target repository. Use virtual paths such as /README.md, /agent/..., /server/..., and /openwiki/quickstart.md with ls, read_file, write_file, edit_file, glob, and grep.",
    to: "Tools operate on the target repository. Use repository-relative paths such as `README.md`, `agent/...`, `server/...`, and `openwiki/quickstart.md` with `Glob`, `Grep`, `Read`, `Write`, and `Edit`.",
  },
  {
    note: "DeepAgents warns against host-absolute paths; Claude Code's file tools require absolute paths, so invert to the correct guidance.",
    from: "Never pass host absolute paths like /Users/... to filesystem tools; that creates nested paths inside the repo instead of touching the intended file.",
    to: "Claude Code's file tools take absolute paths — resolve repository-relative paths against the repository root, keep every path inside that repository, and never write outside it.",
  },
  {
    note: "`shell execute` -> `Bash`.",
    from: "Shell execute commands run on the host. If you use execute, run commands from the target repository directory and keep them inside that repository.",
    to: "`Bash` commands run on the host. Run them from the target repository directory and keep them inside that repository.",
  },
  {
    note: "glob tool + shell -> Glob + Bash.",
    from: "Do not call glob with **/* from the repository root.",
    to: "Do not call `Glob` with `**/*` from the repository root.",
  },
  {
    note: "shell commands -> Bash commands.",
    from: "Prefer shell commands like rg --files with excludes",
    to: "Prefer `Bash` commands like `rg --files` with excludes",
  },
  {
    note: "grep/glob -> Grep/Glob.",
    from: "Prefer grep/glob and short targeted reads over full-file reads when files are large.",
    to: "Prefer `Grep`/`Glob` and short targeted reads over full-file reads when files are large.",
  },
  {
    note: "task tool -> Task tool with the wiki-scout subagent.",
    from: "You may use the task tool to parallelize read-only research",
    to: "You may use the `Task` tool with the `wiki-scout` subagent to parallelize read-only research",
  },
  {
    note: "Virtual plan path -> repository-relative; drop the virtual filesystem qualifier.",
    from: "Use /openwiki/_plan.md when writing this temporary plan with filesystem tools.",
    to: "Use `openwiki/_plan.md` when writing this temporary plan.",
  },
  {
    note: "No filesystem delete tool in Claude Code -> delete with Bash.",
    from: "If there is no filesystem delete tool, use shell execute from the repository root, for example rm -f openwiki/_plan.md.",
    to: "Claude Code has no delete tool, so remove it with `Bash`, for example `rm -f openwiki/_plan.md`.",
  },
  {
    note: "Virtual output paths -> repository-relative.",
    from: "When writing required documentation with filesystem tools, use /openwiki/... paths, for example /openwiki/quickstart.md.",
    to: "When writing documentation, use `openwiki/...` paths, for example `openwiki/quickstart.md`.",
  },
  {
    note: "OpenWiki's CLI records state; wijzer's write-state.sh does (both mode blocks).",
    from: "The CLI will record successful run metadata in openwiki/.last-update.json after you finish.",
    to: "wijzer records successful run metadata in openwiki/.last-update.json after you finish (via scripts/write-state.sh).",
  },
  {
    note: "`shell execution` fallback -> `Bash` (update mode).",
    from: "If shell execution is unavailable,",
    to: "If `Bash` is unavailable,",
  },
  // Global leading-slash virtual paths -> repository-relative. Applied last so
  // the verbatim rules above match the original text first.
  { note: "Leading-slash AGENTS.md path.", from: /\/AGENTS\.md/g, to: "AGENTS.md" },
  { note: "Leading-slash CLAUDE.md path.", from: /\/CLAUDE\.md/g, to: "CLAUDE.md" },
  { note: "Leading-slash openwiki path.", from: /\/openwiki/g, to: "openwiki" },
];

function translate(text) {
  let out = text;
  for (const { from, to } of TRANSLATIONS) {
    out = out.replaceAll(from, to);
  }
  return out;
}

// Tokens that must NOT survive translation into the doctrine body. This is a
// backstop, not a completeness proof: only substrings appearing in a verbatim or
// global rule are caught, so a *reworded* upstream sentence can pass through
// untranslated — the drift-lock (committed != regenerate) is what forces a human
// to review that case. "shell execut" covers both "execute" and "execution".
const RESIDUAL_VOCAB = [
  "read_file",
  "write_file",
  "edit_file",
  "filesystem tool",
  "shell execut",
  "virtual path",
  "task tool",
  "/openwiki",
  "/AGENTS.md",
  "/CLAUDE.md",
  "/Users/",
];

function assertNoResidualVocab(text, where) {
  for (const token of RESIDUAL_VOCAB) {
    if (text.includes(token)) {
      throw new Error(
        `untranslated DeepAgents vocabulary "${token}" survived in ${where} — extend TRANSLATIONS`,
      );
    }
  }
}

// --- Section parsing + routing ---------------------------------------------

// Header lines (exact, ending with ":") in the vendored system prompt, in order,
// each routed to a target. Missing/renamed/reordered headers fail loudly below.
const SECTIONS = [
  { header: "Run discipline:", target: "disciplines" },
  { header: "Subagent discipline:", target: "disciplines" },
  { header: "Planning discipline:", target: "disciplines" },
  { header: "Git discipline:", target: "disciplines" },
  { header: "Existing documentation discipline:", target: "disciplines" },
  { header: "Root agent instruction files:", target: "disciplines" },
  // OpenWiki's own CLI flag surface (openwiki --init/--update/...) is out of
  // wijzer's parity scope: the runtime is Claude Code skills, not a CLI.
  { header: "OpenWiki CLI reference:", target: "drop" },
  { header: "Security and privacy rules:", target: "disciplines" },
  { header: "Documentation goals:", target: "wikiFormat" },
  { header: "Section quality rules:", target: "wikiFormat" },
  { header: "Required documentation structure:", target: "wikiFormat" },
  { header: "Mode-specific behavior:", target: "disciplines" },
];

// Sections whose *write mechanism* differs between OpenWiki and wijzer, so a
// vocabulary swap is not enough — the derived text would tell the agent to do
// something wijzer does with a script instead. These get a documented,
// distribution-method adaptation (body only; the `## <header>` stays). OpenWiki
// has the agent hand-write an `## OpenWiki` pointer block "every time"; wijzer
// writes a marker-delimited block deterministically with inject-pointer.sh, so
// deriving the verbatim block would both contradict the script and (on update)
// invite duplicate blocks. Keep the parity-relevant rules, replace the mechanism.
const ADAPTED_SECTIONS = {
  "Root agent instruction files:": [
    "*Distribution-method adaptation: OpenWiki has the agent hand-write this",
    "pointer block; wijzer writes it deterministically with",
    "[`scripts/inject-pointer.sh`](../scripts/inject-pointer.sh). The parity intent —",
    "a top-level, idempotent pointer into the wiki — is preserved; the exact",
    "`## OpenWiki` block OpenWiki embeds here is replaced by the script's",
    "marker-delimited block.*",
    "",
    "- Point coding agents at the wiki from the repository's **top-level**",
    "  `AGENTS.md` / `CLAUDE.md` — never nested `AGENTS.md`/`CLAUDE.md` files.",
    "- Do not hand-write the block. Run `scripts/inject-pointer.sh`, which creates",
    "  or updates a marker-delimited block idempotently (safe to re-run) and",
    "  preserves the surrounding content.",
    "- On update runs, re-run `scripts/inject-pointer.sh` so a repository that",
    "  gained an `AGENTS.md`/`CLAUDE.md` since init picks up the block; it no-ops",
    "  when the block is already present.",
    "- Do not make formatting-only edits to these files.",
  ].join("\n"),
};

/**
 * Split the trimmed system prompt into { intro, sections{header->body} } and
 * assert the header set is exactly SECTIONS (order included) and that no text is
 * lost — join(all parts) must reproduce the input.
 */
function splitSections(systemPrompt) {
  const lines = systemPrompt.split("\n");
  const headerSet = new Set(SECTIONS.map((s) => s.header));
  const parts = []; // { header|null, lines[] }
  let current = { header: null, lines: [] };
  for (const line of lines) {
    if (headerSet.has(line)) {
      parts.push(current);
      current = { header: line, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  parts.push(current);

  const found = parts.filter((p) => p.header).map((p) => p.header);
  const expected = SECTIONS.map((s) => s.header);
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw new Error(
      `prompt.ts section headers drifted.\n expected: ${expected.join(" | ")}\n found:    ${found.join(" | ")}`,
    );
  }
  // Completeness: reassembling every part must reproduce the input verbatim.
  const rejoined = parts
    .map((p) => (p.header ? [p.header, ...p.lines] : p.lines).join("\n"))
    .join("\n");
  if (rejoined !== systemPrompt) {
    throw new Error("section split lost or duplicated text from prompt.ts");
  }

  const intro = parts[0].lines.join("\n").trim();
  const sections = {};
  for (const p of parts) {
    if (p.header) sections[p.header] = p.lines.join("\n").trimEnd();
  }

  // Silent-drop guard. A known header set can't catch a NEW upstream section: it
  // gets absorbed as body into the preceding section. If that section is one we
  // do not render — the dropped CLI section, or the "Mode-specific behavior:"
  // placeholder whose body is the interpolation we compose ourselves — the new
  // doctrine vanishes and regeneration is byte-identical, so the drift-lock stays
  // green while a discipline was lost. Fail loudly if an unrendered bucket holds a
  // header-shaped line, and require the mode placeholder to be empty.
  const unrendered = SECTIONS.filter(
    (s) => s.target === "drop" || s.header === "Mode-specific behavior:",
  ).map((s) => s.header);
  const HEADER_SHAPE = /^[A-Z][A-Za-z][A-Za-z /-]*:$/;
  for (const header of unrendered) {
    const stray = (sections[header] ?? "").split("\n").find((l) => HEADER_SHAPE.test(l));
    if (stray) {
      throw new Error(
        `possible new upstream section "${stray}" absorbed into the unrendered "${header}" bucket — add it to SECTIONS with a target`,
      );
    }
  }
  if ((sections["Mode-specific behavior:"] ?? "").trim() !== "") {
    throw new Error(
      "content follows 'Mode-specific behavior:' beyond the mode interpolation — new upstream section?",
    );
  }
  return { intro, sections };
}

/** `Run discipline:` -> `## Run discipline`. */
function headerToMarkdown(header) {
  return `## ${header.replace(/:$/, "")}`;
}

// --- Assembly --------------------------------------------------------------

function generatedHeader(sha, regenNote) {
  return `<!-- GENERATED — DO NOT EDIT.
     Regenerate with: node scripts/build-disciplines.mjs
     Derived from vendor/openwiki/src/agent/prompt.ts @ ${sha}
     ${regenNote}
     Drift-locked by tests/build-disciplines.test.ts. -->`;
}

function translationAppendix() {
  const rows = TRANSLATIONS.map(({ from, note }) => {
    const shown = from instanceof RegExp ? `\`${from.source}\`` : `"${truncate(from)}"`;
    return `- ${note}\n  - matches ${shown}`;
  }).join("\n");
  return `## How this file is generated

This file is **generated** from the vendored OpenWiki system prompt
([\`vendor/openwiki/src/agent/prompt.ts\`](../vendor/openwiki/src/agent/prompt.ts))
by [\`scripts/build-disciplines.mjs\`](../scripts/build-disciplines.mjs). Do not
edit it by hand — edit the generator and re-run it. The build applies this
documented tool-vocabulary translation from OpenWiki's DeepAgents virtual
filesystem to Claude Code's real tools:

${rows}

Two sections need more than a vocabulary swap:

- \`OpenWiki CLI reference:\` is **dropped** — its subject, the \`openwiki\` CLI flag
  surface, is out of wijzer's parity scope, since wijzer's runtime is Claude Code
  skills (\`/wijzer:init\`, \`:update\`, \`:ask\`), not a CLI.
- \`Root agent instruction files:\` is **adapted** — OpenWiki has the agent
  hand-write an \`## OpenWiki\` pointer block; wijzer writes a marker-delimited
  block deterministically with \`scripts/inject-pointer.sh\`, so the parity-relevant
  rules are kept but the write mechanism and embedded block are replaced.`;
}

function truncate(s, n = 72) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function buildDisciplines(intro, sections, modeInstructions, sha) {
  const order = SECTIONS.filter((s) => s.target === "disciplines").map((s) => s.header);
  const body = [];
  body.push(`# Disciplines`);
  body.push("");
  body.push(
    `The working rules the \`init\`, \`update\`, and \`ask\` skills obey — wijzer's` +
      ` adaptation of OpenWiki's prompt disciplines to the Claude Code runtime.` +
      ` Numbers that appear here (page counts, subagent counts, the diff budget)` +
      ` are the parity contract — keep them.`,
  );
  body.push("");
  body.push(intro);
  for (const header of order) {
    if (header === "Mode-specific behavior:") {
      body.push("");
      body.push(headerToMarkdown(header));
      body.push("");
      body.push(
        `The init and update skills share every discipline above. These are the` +
          ` additional rules for each mode.`,
      );
      body.push("");
      body.push(`### init`);
      body.push("");
      body.push(modeInstructions.init);
      body.push("");
      body.push(`### update`);
      body.push("");
      body.push(modeInstructions.update);
      continue;
    }
    body.push("");
    body.push(headerToMarkdown(header));
    body.push("");
    body.push(header in ADAPTED_SECTIONS ? ADAPTED_SECTIONS[header] : sections[header]);
  }
  const translated = translate(body.join("\n"));
  assertNoResidualVocab(translated, "disciplines.md");
  const regen = "This is behavioral doctrine; the wiki output format lives in wiki-format.md.";
  return `${generatedHeader(sha, regen)}\n\n${translated}\n\n---\n\n${translationAppendix()}\n`;
}

// Format literals wijzer pins from OpenWiki's *generated output*, not from its
// prompt (prompt.ts calls source maps "optional" and never states their shape,
// the no-frontmatter rule, or the quickstart linking headings). These are the
// interchange contract `scripts/check-format.sh` actually enforces, so this file
// — the human companion to that gate — must document them. Kept verbatim here
// (a generator constant, so the whole file stays drift-locked) and labelled with
// their real provenance.
const OBSERVED_FORMAT = [
  "## Page format (observed output)",
  "",
  "wijzer pins these from OpenWiki's rendered `openwiki/` output rather than from",
  "prompt.ts, and [`scripts/check-format.sh`](../scripts/check-format.sh) enforces",
  "them as the interchange contract:",
  "",
  "- **Plain Markdown, no YAML frontmatter.** The first line of every page is a",
  "  level-1 `# ` heading in sentence case — never a `---` delimiter.",
  "- Links between pages are relative Markdown (`./architecture/overview.md`).",
  "- Once the wiki has **2+ pages**, `openwiki/quickstart.md` must carry both a",
  "  `## Start here` heading and a `## Documentation map` heading linking the",
  "  section pages.",
  "",
  "## Source map (observed output)",
  "",
  "A page **may** end with a source map; when present its shape is exact:",
  "",
  "- The heading is literally `## Source map` (capital S, lowercase m).",
  "- One Markdown bullet per source file, the repo-relative path in backticks.",
  "- When git history is relevant, the **last** bullet is a git-evidence line:",
  "  `` - Git evidence: commits `abc1234`, `def5678` `` — the literal",
  "  `Git evidence: commits ` then comma-separated **7-character** backticked",
  "  short hashes. This is the only place persistent commit hashes belong.",
  "",
  "Verbatim example (end of a section page):",
  "",
  "```markdown",
  "## Source map",
  "",
  "- `src/agent/index.ts`",
  "- `src/agent/prompt.ts`",
  "- Git evidence: commits `ceded10`, `f89b05d`, `dfa73cc`",
  "```",
  "",
  "## Size ceilings",
  "",
  "- **Init:** at most **8** documentation pages, unless the repository is clearly",
  "  tiny — a soft ceiling; a small repo should ship far fewer. (This number is",
  "  prompt-derived; it also appears in the init mode block in",
  "  [disciplines.md](disciplines.md).)",
  "- **Update:** governed by the surgical-edit diff budget in",
  "  [disciplines.md](disciplines.md) — fewer than ~5 changed source files means",
  "  editing at most 1–2 pages.",
].join("\n");

function buildWikiFormat(sections, sha) {
  const order = SECTIONS.filter((s) => s.target === "wikiFormat").map((s) => s.header);
  const body = [];
  body.push(`# Wiki format`);
  body.push("");
  body.push(
    `The exact shape of the generated wiki — a **parity contract** with OpenWiki` +
      ` (see [PARITY.md](../PARITY.md)): a repository's \`openwiki/\` folder must be` +
      ` interchangeable between wijzer and OpenWiki. The load-bearing literals` +
      ` below (the \`openwiki/\` directory, the \`quickstart.md\` entrypoint, the` +
      ` \`## Source map\` heading, page counts) must not be renamed or restyled.`,
  );
  for (const header of order) {
    body.push("");
    body.push(headerToMarkdown(header));
    body.push("");
    body.push(sections[header]);
  }
  const translated = translate(body.join("\n"));
  assertNoResidualVocab(translated, "wiki-format.md");
  // The observed-format block is wijzer's own literals; it is not prompt-derived
  // and deliberately not subject to the DeepAgents translation.
  const withObserved = `${translated}\n\n${OBSERVED_FORMAT}`;
  const regen = "Prompt-derived format rules plus wijzer's observed output literals; behavioral doctrine lives in disciplines.md.";
  return `${generatedHeader(sha, regen)}\n\n${withObserved}\n\n---\n\n${translationAppendix()}\n`;
}

// --- Entry -----------------------------------------------------------------

export function generate() {
  const promptSrc = readFileSync(PROMPT_TS, "utf8");
  const constantsSrc = readFileSync(CONSTANTS_TS, "utf8");
  const provenance = readFileSync(PROVENANCE, "utf8");
  const sha = provenance.match(/\b([0-9a-f]{40})\b/)?.[1];
  if (!sha) throw new Error("no pinned SHA in vendor/openwiki/PROVENANCE.md");

  const consts = readConstants(constantsSrc);

  const systemPrompt = substitute(
    extractSingleTemplate(promptSrc, "createSystemPrompt"),
    consts,
  ).trim();

  // createModeInstructions returns [chat, init, update] in source order.
  const modeTemplates = extractAllTemplates(promptSrc, "createModeInstructions");
  if (modeTemplates.length !== 3) {
    throw new Error(
      `expected 3 mode templates (chat, init, update), found ${modeTemplates.length}`,
    );
  }
  const modeInstructions = {
    init: translate(substitute(modeTemplates[1], consts).trim()),
    update: translate(substitute(modeTemplates[2], consts).trim()),
  };
  assertNoResidualVocab(modeInstructions.init, "mode:init");
  assertNoResidualVocab(modeInstructions.update, "mode:update");

  const { intro, sections } = splitSections(systemPrompt);

  return {
    disciplines: buildDisciplines(intro, sections, modeInstructions, sha),
    wikiFormat: buildWikiFormat(sections, sha),
  };
}

function main() {
  const check = process.argv.includes("--check");
  const out = generate();
  const files = [
    [OUT.disciplines, out.disciplines, "references/disciplines.md"],
    [OUT.wikiFormat, out.wikiFormat, "references/wiki-format.md"],
  ];
  if (check) {
    let drift = false;
    for (const [abs, want, rel] of files) {
      const have = readFileSync(abs, "utf8");
      if (have !== want) {
        console.error(`drift: ${rel} is stale — run: node scripts/build-disciplines.mjs`);
        drift = true;
      }
    }
    if (drift) process.exit(1);
    console.log("references/ are in sync with prompt.ts");
    return;
  }
  for (const [abs, want, rel] of files) {
    writeFileSync(abs, want);
    console.log(`wrote ${rel}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
