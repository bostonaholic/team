// Runs skills/team-fix/scripts/branch-gate.sh against scratch repos.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-fix/scripts/branch-gate.sh");

function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "branch-gate-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1", GIT_CEILING_DIRECTORIES: root };
  const git = (cwd, ...args) => {
    const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };
  const gate = (cwd, ...args) => spawnSync("bash", [SCRIPT, ...args], { cwd, env, encoding: "utf8" });
  return { root, git, gate };
}

// A clone of a bare origin whose remote head is `trunk`.
function cloned(t) {
  const s = scratch(t);
  const origin = join(s.root, "origin.git");
  s.git(s.root, "init", "-q", "--bare", "-b", "trunk", origin);
  const repo = join(s.root, "repo");
  s.git(s.root, "clone", "-q", origin, repo);
  s.git(repo, "switch", "-q", "-c", "trunk");
  s.git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  s.git(repo, "push", "-q", "origin", "trunk");
  s.git(repo, "remote", "set-head", "origin", "trunk");
  return { ...s, repo };
}

// A repo with no remote and one commit on `branch`.
function local(t, branch) {
  const s = scratch(t);
  const repo = join(s.root, "repo");
  s.git(s.root, "init", "-q", "-b", branch, repo);
  s.git(repo, "commit", "-q", "--allow-empty", "-m", "init");
  return { ...s, repo };
}

test("on the origin/HEAD branch: on-default, exit 1", (t) => {
  const { repo, gate } = cloned(t);
  const run = gate(repo);
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "on-default\n");
});

test("origin/HEAD wins over a local main", (t) => {
  const { repo, git, gate } = cloned(t);
  git(repo, "switch", "-q", "-c", "main");
  const run = gate(repo);
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "ok main\n");
});

test("on a feature branch: ok <branch>, exit 0", (t) => {
  const { repo, git, gate } = cloned(t);
  git(repo, "switch", "-q", "-c", "fix-thing");
  const run = gate(repo);
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "ok fix-thing\n");
});

test("from a subdirectory of a linked worktree", (t) => {
  const { root, repo, git, gate } = cloned(t);
  const wt = join(root, "wt");
  git(repo, "worktree", "add", "-q", "-b", "fix-wt", wt);
  git(wt, "commit", "-q", "--allow-empty", "-m", "x");
  mkdirSync(join(wt, "sub"));
  const run = gate(join(wt, "sub"));
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "ok fix-wt\n");
});

test("no remote, on main: on-default", (t) => {
  const { repo, gate } = local(t, "main");
  const run = gate(repo);
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "on-default\n");
});

test("no remote, on master: on-default", (t) => {
  const { repo, gate } = local(t, "master");
  assert.equal(gate(repo).stdout, "on-default\n");
});

test("no remote, main preferred over master", (t) => {
  const { repo, git, gate } = local(t, "master");
  git(repo, "branch", "main");
  const run = gate(repo);
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "ok master\n");
});

test("no remote and no main or master: ok", (t) => {
  const { repo, gate } = local(t, "dev");
  const run = gate(repo);
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "ok dev\n");
});

test("detached HEAD: ok HEAD", (t) => {
  const { repo, git, gate } = cloned(t);
  git(repo, "switch", "-q", "--detach");
  const run = gate(repo);
  assert.equal(run.status, 0);
  assert.equal(run.stdout, "ok HEAD\n");
});

test("outside a git repository: exit 3, nothing on stdout", (t) => {
  const { root, gate } = scratch(t);
  const run = gate(root);
  assert.equal(run.status, 3);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /not inside a git repository/);
});

test("repository with no commit: exit 3", (t) => {
  const { root, git, gate } = scratch(t);
  const repo = join(root, "empty");
  git(root, "init", "-q", repo);
  const run = gate(repo);
  assert.equal(run.status, 3);
  assert.equal(run.stdout, "");
});

test("git not on PATH: exit 3", (t) => {
  const { repo } = local(t, "main");
  const run = spawnSync("/bin/bash", [SCRIPT], { cwd: repo, env: { PATH: "/nonexistent" }, encoding: "utf8" });
  assert.equal(run.status, 3);
  assert.match(run.stderr, /git is not installed/);
});

test("any argument: usage fault, exit 2", (t) => {
  const { repo, gate } = local(t, "main");
  const run = gate(repo, "extra");
  assert.equal(run.status, 2);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /usage/);
});
