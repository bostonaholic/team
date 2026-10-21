// Runs skills/team-pr/scripts/ship-state.sh against a scratch clone of a bare origin.
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-pr/scripts/ship-state.sh");

function scratchClone(t, defaultBranch = "main") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ship-state-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, `[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = ${defaultBranch}\n`);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1", XDG_CONFIG_HOME: root };
  const git = (cwd, ...args) => {
    const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };
  const origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", origin);
  const repo = join(root, "repo");
  git(root, "clone", "-q", origin, repo);
  writeFileSync(join(repo, ".gitignore"), "ignored.log\n");
  git(repo, "add", ".gitignore");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "push", "-q", "origin", defaultBranch);
  let counter = 0;
  const commit = () => {
    counter += 1;
    writeFileSync(join(repo, `file-${counter}.txt`), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", `change ${counter}`);
  };
  const run = (path = repo) => spawnSync(SCRIPT, [path], { env, encoding: "utf8" });
  return { root, repo, git: (...args) => git(repo, ...args), commit, run };
}

test("reports origin/HEAD's branch, commits ahead, and uncommitted paths", (t) => {
  const s = scratchClone(t, "trunk");
  s.git("remote", "set-head", "origin", "trunk");
  s.git("checkout", "-q", "-b", "feature");
  s.commit();
  s.commit();
  writeFileSync(join(s.repo, "file-1.txt"), "edited\n");
  writeFileSync(join(s.repo, "untracked.txt"), "new\n");
  writeFileSync(join(s.repo, "ignored.log"), "noise\n");
  const run = s.run();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "base=trunk\nahead=2\ndirty=2\n");
});

test("falls back to main when origin/HEAD is unset", (t) => {
  const s = scratchClone(t);
  s.git("remote", "set-head", "origin", "--delete");
  const run = s.run();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "base=main\nahead=0\ndirty=0\n");
});

test("a missing origin/<base> ref exits 2", (t) => {
  const s = scratchClone(t, "trunk");
  s.git("remote", "set-head", "origin", "--delete");
  const run = s.run();
  assert.equal(run.status, 2);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /no origin\/main ref/);
});

test("a directory outside any repository exits 2", (t) => {
  const s = scratchClone(t);
  const run = s.run(s.root);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /not a git worktree/);
});

test("a wrong argument count exits 2 with usage", () => {
  for (const args of [[], ["a", "b"], [""]]) {
    const run = spawnSync(SCRIPT, args, { encoding: "utf8" });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /usage: .*ship-state\.sh <worktree-path>/);
  }
});
