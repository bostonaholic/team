// Runs skills/team-review/scripts/tree-check.sh against scratch repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-review/scripts/tree-check.sh");
const BASH = spawnSync("sh", ["-c", "command -v bash"], { encoding: "utf8" }).stdout.trim();

// A repository with one commit holding a.txt and b.txt.
function scratchRepo(t, { commit = true } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tree-check-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    XDG_CONFIG_HOME: root, // keeps a personal git/ignore from hiding the test's untracked files
  };
  const repo = join(root, "repo");
  mkdirSync(repo);
  const git = (...args) => {
    const run = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };
  git("init", "-q");
  if (commit) {
    writeFileSync(join(repo, "a.txt"), "a\n");
    writeFileSync(join(repo, "b.txt"), "b\n");
    git("add", ".");
    git("commit", "-q", "-m", "init");
  }
  const check = (mode, cwd = repo, extraEnv = {}) =>
    spawnSync(BASH, [SCRIPT, ...(mode === undefined ? [] : [].concat(mode))], {
      cwd,
      env: { ...env, ...extraEnv },
      encoding: "utf8",
    });
  const write = (name, text) => writeFileSync(join(repo, name), text);
  return { root, repo, git, check, write };
}

function assertSnapshot(run) {
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
}

test("an unchanged tree compares clean with no output", (t) => {
  const r = scratchRepo(t);
  r.write("dirty.txt", "already here\n");
  assertSnapshot(r.check("snapshot"));
  const run = r.check("compare");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
});

test("a new untracked file is a changed path", (t) => {
  const r = scratchRepo(t);
  assertSnapshot(r.check("snapshot"));
  mkdirSync(join(r.repo, "out"));
  r.write("out/report.log", "x\n");
  const run = r.check("compare");
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "path out/report.log\n");
});

test("a reverted, deleted, or staged path is named once each, sorted", (t) => {
  const r = scratchRepo(t);
  r.write("c.txt", "pre-existing untracked\n");
  r.write("a.txt", "dirty before dispatch\n");
  assertSnapshot(r.check("snapshot"));
  r.write("a.txt", "a\n"); // reverted to HEAD: its status line vanishes
  unlinkSync(join(r.repo, "b.txt"));
  r.git("add", "c.txt"); // ?? becomes A: the line changes, the path is named once
  const run = r.check("compare");
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "path a.txt\npath b.txt\npath c.txt\n");
});

test("a moved HEAD is reported before any path", (t) => {
  const r = scratchRepo(t);
  const before = r.git("rev-parse", "HEAD");
  assertSnapshot(r.check("snapshot"));
  r.write("a.txt", "committed by a reviewer\n");
  r.git("commit", "-q", "-am", "reviewer");
  const after = r.git("rev-parse", "HEAD");
  r.write("z.txt", "z\n");
  const run = r.check("compare");
  assert.equal(run.status, 1);
  assert.equal(run.stdout, `head ${before} ${after}\npath z.txt\n`);
});

test("a rerun snapshot replaces the record, and compare can rerun", (t) => {
  const r = scratchRepo(t);
  assertSnapshot(r.check("snapshot"));
  r.write("new.txt", "n\n");
  assert.equal(r.check("compare").status, 1);
  assert.equal(r.check("compare").status, 1);
  assertSnapshot(r.check("snapshot"));
  const run = r.check("compare");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, "");
});

test("each linked worktree keeps its own record", (t) => {
  const r = scratchRepo(t);
  const linked = join(r.root, "linked");
  r.git("worktree", "add", "-q", "-b", "feature", linked);
  assertSnapshot(r.check("snapshot"));
  const run = r.check("compare", linked);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /no snapshot recorded/);
  assertSnapshot(r.check("snapshot", linked));
  assert.equal(r.check("compare", linked).status, 0);
});

test("compare with no snapshot fails loudly", (t) => {
  const r = scratchRepo(t);
  const run = r.check("compare");
  assert.equal(run.status, 2);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /no snapshot recorded/);
});

test("usage faults exit 2", (t) => {
  const r = scratchRepo(t);
  for (const args of [undefined, "diff", ["snapshot", "extra"]]) {
    const run = r.check(args);
    assert.equal(run.status, 2, `args: ${JSON.stringify(args)}`);
    assert.match(run.stderr, /usage:/);
  }
});

test("outside a worktree, it fails loudly", (t) => {
  const r = scratchRepo(t);
  const outside = join(r.root, "outside");
  mkdirSync(outside);
  const run = r.check("snapshot", outside, { GIT_CEILING_DIRECTORIES: r.root });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /not inside a git worktree/);
});

test("an unborn HEAD fails loudly and records nothing", (t) => {
  const r = scratchRepo(t, { commit: false });
  const run = r.check("snapshot");
  assert.equal(run.status, 2);
  assert.match(run.stderr, /cannot resolve HEAD/);
  assert.match(r.check("compare").stderr, /no snapshot recorded/);
});

test("a missing git fails loudly", (t) => {
  const r = scratchRepo(t);
  const empty = join(r.root, "empty-bin");
  mkdirSync(empty);
  const run = r.check("snapshot", r.repo, { PATH: empty });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /git not found/);
});
