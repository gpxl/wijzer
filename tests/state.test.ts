import { readFile, writeFile } from "node:fs/promises";
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

  test("cross-compat: check-noop.sh reads a state file written by real OpenWiki", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    // Byte-shaped exactly like OpenWiki's writeLastUpdateMetadata output
    // (2-space pretty JSON, trailing newline, key order updatedAt/command/
    // gitHead/model). If our parser only accepted our own serialization this
    // would fail — proving the interchangeability guarantee.
    const openwikiState = `${JSON.stringify(
      {
        updatedAt: "2026-06-30T21:20:03.130Z",
        command: "update",
        gitHead: head,
        model: "accounts/fireworks/models/glm-5p2",
      },
      null,
      2,
    )}\n`;
    await writeFile(
      path.join(repo, "openwiki", ".last-update.json"),
      openwikiState,
      "utf8",
    );

    const verdict = await runScriptJson<NoopVerdict>("check-noop.sh", repo);
    expect(verdict.stateGitHead).toBe(head);
    expect(verdict.noop).toBe(true);
  });

  test("cross-compat: a state file we wrote parses as the OpenWiki schema", async () => {
    const repo = await createRepoWithOpenWiki();
    await runScriptJson<WriteResult>("write-state.sh", repo, [
      "--command",
      "update",
      "--model",
      "claude-opus-4-8",
    ]);
    const parsed = JSON.parse(
      await readFile(path.join(repo, "openwiki", ".last-update.json"), "utf8"),
    );
    // The three fields OpenWiki's readLastUpdate requires to be strings.
    expect(typeof parsed.updatedAt).toBe("string");
    expect(["init", "update"]).toContain(parsed.command);
    expect(typeof parsed.model).toBe("string");
  });

  test("noop-then-write leaves check-noop still a no-op (churn prevention shape)", async () => {
    const repo = await createRepoWithOpenWiki();
    const head = await git(repo, ["rev-parse", "HEAD"]);
    await writeLastUpdate(repo, head, "prev-model");
    const first = await runScriptJson<NoopVerdict>("check-noop.sh", repo);
    expect(first.noop).toBe(true);
  });
});
