import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createRepoWithOpenWiki,
  git,
  runScriptJson,
  writeLastUpdate,
} from "./helpers/fixtures.ts";

type WriteResult = {
  written: boolean;
  path: string;
  command: string;
  gitHead: string;
  model: string;
};

type NoopVerdict = { noop: boolean; reason: string; stateGitHead: string };

describe("write-state.sh", () => {
  test("writes an OpenWiki-schema state file at openwiki/.last-update.json", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);

    const result = await runScriptJson<WriteResult>("write-state.sh", repo, [
      "--command",
      "init",
      "--model",
      "claude-opus-4-8",
    ]);
    expect(result.written).toBe(true);
    expect(result.path).toBe("openwiki/.last-update.json");

    const raw = await readFile(
      path.join(repo, "openwiki", ".last-update.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw);
    // Exact OpenWiki UpdateMetadata shape.
    expect(parsed.command).toBe("init");
    expect(parsed.gitHead).toBe(head);
    expect(parsed.model).toBe("claude-opus-4-8");
    expect(typeof parsed.updatedAt).toBe("string");
    expect(raw.endsWith("\n")).toBe(true);
  });

  test("rejects an invalid command", async () => {
    const repo = await createRepoWithOpenWiki();
    const { code } = await import("./helpers/fixtures.ts").then((m) =>
      m.runScript("write-state.sh", repo, ["--command", "bogus", "--model", "m"]),
    );
    expect(code).toBe(2);
  });

  test("falls back to a stable provenance literal for an unusable model id", async () => {
    const repo = await createRepoWithOpenWiki();
    const result = await runScriptJson<WriteResult>("write-state.sh", repo, [
      "--command",
      "update",
      "--model",
      "not a valid model!!",
    ]);
    expect(result.model).toBe("claude-code");
  });

  test("round-trips: a state file we wrote is read back by check-noop.sh", async () => {
    const repo = await createRepoWithOpenWiki();
    await runScriptJson<WriteResult>("write-state.sh", repo, [
      "--command",
      "init",
      "--model",
      "claude-opus-4-8",
    ]);
    // HEAD is unchanged and the tree is clean (state file is ignored) => no-op.
    const verdict = await runScriptJson<NoopVerdict>("check-noop.sh", repo);
    expect(verdict.noop).toBe(true);
  });

  // Cross-tool interchange (state written by real OpenWiki read by our
  // check-noop.sh, and vice versa) now lives in tests/parity-crossvalidate.ts,
  // exercised against the real vendored writeLastUpdateMetadata/getUpdateNoopStatus
  // rather than a hand-shaped JSON approximation. This file keeps only the
  // wijzer-specific write-state.sh CLI contract (arg validation, envelope, model
  // fallback, second-precision timestamp).

  test("noop-then-write leaves check-noop still a no-op (churn prevention shape)", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head, "prev-model");
    const first = await runScriptJson<NoopVerdict>("check-noop.sh", repo);
    expect(first.noop).toBe(true);
  });
});
