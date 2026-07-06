import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(HERE, "..", "..", "scripts");

/** Run a git command in `cwd`, returning trimmed stdout. Ported from OpenWiki. */
export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/**
 * Run one of the wijzer scripts against `cwd` and return { stdout, stderr, code }.
 * The scripts receive `--dir cwd`; every script prints a single JSON object.
 */
export async function runScript(
  script: string,
  cwd: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; code: number }> {
  const scriptPath = path.join(SCRIPTS_DIR, script);
  try {
    const { stdout, stderr } = await execFileAsync(
      "bash",
      [scriptPath, "--dir", cwd, ...args],
      { cwd },
    );
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? "", stderr: e.stderr ?? "", code: e.code ?? 1 };
  }
}

/** Run a script and parse its single-JSON-object stdout. */
export async function runScriptJson<T = Record<string, unknown>>(
  script: string,
  cwd: string,
  args: string[] = [],
): Promise<T> {
  const { stdout, stderr, code } = await runScript(script, cwd, args);
  if (code !== 0) {
    throw new Error(`${script} exited ${code}: ${stderr || stdout}`);
  }
  try {
    return JSON.parse(stdout.trim()) as T;
  } catch {
    throw new Error(`${script} did not emit valid JSON:\n${stdout}`);
  }
}

/**
 * A temp git repo with an openwiki/ folder and one committed doc page.
 * Ported from OpenWiki's test/update-noop.test.ts.
 */
export async function createRepoWithOpenWiki(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "wijzer-"));
  await git(repo, ["init"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "wijzer Test"]);
  await writeFile(path.join(repo, "README.md"), "# Test Repo\n", "utf8");
  await mkdir(path.join(repo, "openwiki"));
  await writeFile(
    path.join(repo, "openwiki", "quickstart.md"),
    "# Quickstart\n",
    "utf8",
  );
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "initial"]);
  return repo;
}

/** Write openwiki/.last-update.json pointing at `gitHead`. Ported from OpenWiki. */
export async function writeLastUpdate(
  repo: string,
  gitHead: string,
  model = "test-model",
): Promise<void> {
  await writeFile(
    path.join(repo, "openwiki", ".last-update.json"),
    `${JSON.stringify({
      updatedAt: new Date().toISOString(),
      command: "update",
      gitHead,
      model,
    })}\n`,
    "utf8",
  );
}
