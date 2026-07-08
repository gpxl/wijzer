import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// Importability proof: if Vitest could not transform the vendored .ts (or resolve
// its `.js` import specifiers to the sibling .ts files), these imports throw at
// collection time and the whole suite fails. This is the "tests can import the
// vendored .ts directly, no new runtime dep" guarantee from the vendoring bead.
import {
  shouldCheckUpdateNoop,
  getUpdateNoopStatus,
} from "../vendor/openwiki/src/agent/utils.ts";
import {
  OPEN_WIKI_DIR,
  UPDATE_METADATA_PATH,
} from "../vendor/openwiki/src/constants.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const VENDOR_DIR = path.join(REPO_ROOT, "vendor", "openwiki");

/** git blob SHA of a file — the same identity GitHub records in its tree. */
function blobSha(absPath: string): string {
  return execFileSync("git", ["hash-object", absPath], { cwd: REPO_ROOT })
    .toString()
    .trim();
}

/** Every regular file under VENDOR_DIR, as paths relative to VENDOR_DIR. */
function listVendorFiles(dir = VENDOR_DIR, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) out.push(...listVendorFiles(abs, rel));
    else out.push(rel);
  }
  return out;
}

/** Parse `manifest.blobsha` into an ordered [relpath, sha] list. */
function readManifest(): Array<[string, string]> {
  const raw = readFileSync(path.join(VENDOR_DIR, "manifest.blobsha"), "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [sha, rel] = line.split(/\s+/, 2);
      return [rel, sha] as [string, string];
    });
}

const PINNED_SHA_RE = /\b([0-9a-f]{40})\b/;

describe("vendored OpenWiki source", () => {
  test("is importable and executes (no new runtime dep)", async () => {
    // Constants came across intact.
    expect(OPEN_WIKI_DIR).toBe("openwiki");
    expect(UPDATE_METADATA_PATH).toBe("openwiki/.last-update.json");

    // A pure branch of the real algorithm runs from the vendored source:
    // no userMessage => check for a no-op; an explicit message => force a run.
    expect(shouldCheckUpdateNoop({ command: "update" } as never)).toBe(true);
    expect(
      shouldCheckUpdateNoop({ command: "update", userMessage: "x" } as never),
    ).toBe(false);
    // The async entrypoint is real (proves node:* + relative imports resolve).
    expect(typeof getUpdateNoopStatus).toBe("function");
  });

  test("pinned commit stays in lockstep with PARITY.md", () => {
    const provenance = readFileSync(
      path.join(VENDOR_DIR, "PROVENANCE.md"),
      "utf8",
    );
    const parity = readFileSync(path.join(REPO_ROOT, "PARITY.md"), "utf8");

    const provSha = provenance.match(PINNED_SHA_RE)?.[1];
    const paritySha = parity.match(PINNED_SHA_RE)?.[1];

    expect(provSha).toBeDefined();
    expect(paritySha).toBeDefined();
    // A bump to one without re-vendoring the other is a silent parity lie.
    expect(provSha).toBe(paritySha);
  });

  test("PROVENANCE records source URL and fetch date", () => {
    const provenance = readFileSync(
      path.join(VENDOR_DIR, "PROVENANCE.md"),
      "utf8",
    );
    expect(provenance).toContain("github.com/langchain-ai/openwiki");
    expect(provenance).toMatch(/Fetched \(UTC\):.*\d{4}-\d{2}-\d{2}/);
  });

  test("every committed file matches its manifest blob SHA (drift is loud)", () => {
    const manifest = readManifest();
    expect(manifest.length).toBeGreaterThan(0);
    for (const [rel, sha] of manifest) {
      const abs = path.join(VENDOR_DIR, rel);
      expect(blobSha(abs), `blob SHA drift in vendor/openwiki/${rel}`).toBe(sha);
    }
  });

  test("manifest covers exactly the vendored files (no unlisted, none missing)", () => {
    const manifestFiles = readManifest()
      .map(([rel]) => rel)
      .sort();
    // The manifest and PROVENANCE describe the vendor set; they are not part of it.
    const present = listVendorFiles()
      .filter((rel) => rel !== "manifest.blobsha" && rel !== "PROVENANCE.md")
      .sort();
    expect(manifestFiles).toEqual(present);
  });

  test("LICENSE is vendored verbatim (pristine, no attribution header)", () => {
    const license = readFileSync(path.join(VENDOR_DIR, "LICENSE"), "utf8");
    expect(license).toMatch(/MIT License/i);
    // A header would corrupt the license text and its upstream blob identity.
    expect(license.startsWith("// Vendored from")).toBe(false);
  });
});
