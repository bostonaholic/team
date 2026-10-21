// Runs skills/team-worktree/scripts/{detect-worktree,add-worktree,sweep-residue,run-teardown}.sh against scratch repos.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPTS = resolve("skills/team-worktree/scripts");

// A parent directory holding a bare origin and a clone `repo` of it with origin/HEAD set.
function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "team-worktree-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1", XDG_CONFIG_HOME: root };
  delete env.TEAM_TEARDOWN_TIMEOUT;

  const git = (cwd, ...args) => {
    const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };

  // A clone of its own bare origin, as a direct child of `parent`.
  const clone = (name, parent = join(root, "work")) => {
    mkdirSync(parent, { recursive: true });
    const origin = join(root, `${name}.git`);
    git(root, "init", "-q", "--bare", origin);
    const repo = join(parent, name);
    git(root, "clone", "-q", origin, repo);
    writeFileSync(join(repo, ".gitignore"), ".claude/worktrees/\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-q", "-m", "init");
    git(repo, "push", "-q", "origin", "main");
    git(repo, "remote", "set-head", "origin", "main");
    return repo;
  };

  const run = (script, args, extraEnv = {}) =>
    spawnSync("bash", [join(SCRIPTS, script), ...args], { env: { ...env, ...extraEnv }, encoding: "utf8" });

  return { root, git, clone, run, repo: clone("repo") };
}

function out(run, status = 0) {
  assert.equal(run.status, status, `stdout: ${run.stdout}\nstderr: ${run.stderr}`);
  return run.stdout.trimEnd().split("\n");
}

// --- detect-worktree.sh ------------------------------------------------------

test("detect: the primary clone needs a new worktree", (t) => {
  const s = scratch(t);
  assert.deepEqual(out(s.run("detect-worktree.sh", [s.repo])), ["create"]);
});

test("detect: a linked worktree on a feature branch is reused", (t) => {
  const s = scratch(t);
  const wt = join(s.repo, ".claude/worktrees/feat");
  s.git(s.repo, "worktree", "add", "-q", "-b", "feat", wt);
  assert.deepEqual(out(s.run("detect-worktree.sh", [wt])), [`reuse feat ${wt}`]);
});

test("detect: a detached linked worktree is reused as HEAD", (t) => {
  const s = scratch(t);
  const wt = join(s.repo, "detached wt");
  s.git(s.repo, "worktree", "add", "-q", "--detach", wt);
  assert.deepEqual(out(s.run("detect-worktree.sh", [wt])), [`reuse HEAD ${wt}`]);
});

test("detect: a linked worktree on the default branch is refused", (t) => {
  const s = scratch(t);
  s.git(s.repo, "switch", "-q", "-c", "other");
  const wt = join(s.repo, ".claude/worktrees/on-main");
  s.git(s.repo, "worktree", "add", "-q", wt, "main");
  assert.deepEqual(out(s.run("detect-worktree.sh", [wt])), [`refuse main ${wt}`]);
});

test("detect: without origin/HEAD the default falls back to a local main", (t) => {
  const s = scratch(t);
  s.git(s.repo, "remote", "set-head", "origin", "-d");
  s.git(s.repo, "switch", "-q", "-c", "other");
  const wt = join(s.repo, "wt");
  s.git(s.repo, "worktree", "add", "-q", wt, "main");
  assert.deepEqual(out(s.run("detect-worktree.sh", [wt])), [`refuse main ${wt}`]);
});

test("detect: a linked worktree with no resolvable default branch fails", (t) => {
  const s = scratch(t);
  s.git(s.repo, "remote", "set-head", "origin", "-d");
  s.git(s.repo, "branch", "-q", "-m", "main", "trunk");
  const wt = join(s.repo, "wt");
  s.git(s.repo, "worktree", "add", "-q", "-b", "feat", wt);
  const run = s.run("detect-worktree.sh", [wt]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no default branch/);
});

test("detect: a non-repository fails and a missing argument is a usage fault", (t) => {
  const s = scratch(t);
  assert.equal(s.run("detect-worktree.sh", [s.root]).status, 1);
  assert.equal(s.run("detect-worktree.sh", []).status, 2);
  assert.equal(s.run("detect-worktree.sh", [""]).status, 2);
});

// --- add-worktree.sh ---------------------------------------------------------

test("add: the home repo gets a worktree off origin/HEAD, and a rerun changes nothing", (t) => {
  const s = scratch(t);
  const target = join(s.repo, ".claude/worktrees/topic");
  assert.deepEqual(out(s.run("add-worktree.sh", [s.repo, s.repo, "topic"])), [`created topic origin/HEAD ${target}`]);
  assert.equal(s.git(target, "rev-parse", "--abbrev-ref", "HEAD"), "topic");
  assert.equal(s.git(target, "rev-parse", "HEAD"), s.git(s.repo, "rev-parse", "origin/main"));

  assert.deepEqual(out(s.run("add-worktree.sh", [s.repo, s.repo, "topic"])), [`exists topic ${target}`]);
});

test("add: a sibling repo passes containment", (t) => {
  const s = scratch(t);
  const sibling = s.clone("sibling");
  const target = join(sibling, ".claude/worktrees/topic");
  assert.deepEqual(out(s.run("add-worktree.sh", [s.repo, sibling, "topic"])), [`created topic origin/HEAD ${target}`]);
});

test("add: a repo outside the home repo's sibling set is refused untouched", (t) => {
  const s = scratch(t);
  const outside = s.clone("outside", join(s.root, "elsewhere"));
  assert.deepEqual(out(s.run("add-worktree.sh", [s.repo, outside, "topic"]), 3), [`refused (containment) ${outside}`]);
  assert.equal(existsSync(join(outside, ".claude/worktrees/topic")), false);
});

test("add: without origin the branch is based on a local main, with a warning", (t) => {
  const s = scratch(t);
  s.git(s.repo, "remote", "remove", "origin");
  const target = join(s.repo, ".claude/worktrees/topic");
  assert.deepEqual(out(s.run("add-worktree.sh", [s.repo, s.repo, "topic"])), [
    `warn (no origin/HEAD: based on main) ${s.repo}`,
    `created topic main ${target}`,
  ]);
});

test("add: an unsafe or slashed branch name is a usage fault", (t) => {
  const s = scratch(t);
  for (const branch of ["feat/x", "-x", "a..b", "a b", ""]) {
    assert.equal(s.run("add-worktree.sh", [s.repo, s.repo, branch]).status, 2, branch);
  }
  assert.equal(s.run("add-worktree.sh", [s.repo, s.repo]).status, 2);
});

test("add: a sibling that is not a git checkout fails", (t) => {
  const s = scratch(t);
  const plain = join(s.root, "work", "plain");
  mkdirSync(plain);
  const run = s.run("add-worktree.sh", [s.repo, plain, "topic"]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /not a git checkout/);
});

test("add: a branch that already exists fails loud", (t) => {
  const s = scratch(t);
  s.git(s.repo, "branch", "topic");
  const run = s.run("add-worktree.sh", [s.repo, s.repo, "topic"]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /git worktree add/);
});

// --- sweep-residue.sh --------------------------------------------------------

function put(path, content = "x\n") {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

test("residue: only pure residue is swept, and live worktrees are never touched", (t) => {
  const s = scratch(t);
  const base = join(s.repo, ".claude/worktrees");
  const live = join(base, "live");
  s.git(s.repo, "worktree", "add", "-q", "-b", "live", live);
  put(join(base, "residue/tmp/cache"));
  put(join(base, "residue/docs/plans/x/1-task.md"));
  put(join(base, "residue/.omc/state"));
  put(join(base, "checkout/.git"), "gitdir: /nowhere\n");
  put(join(base, "work/src/app.js"));

  const lines = out(s.run("sweep-residue.sh", [s.repo]));

  assert.deepEqual(lines, [
    `kept (still a checkout) ${join(base, "checkout")}`,
    `swept ${join(base, "residue")}`,
    `kept (unexpected files) ${join(base, "work")}`,
    `  ${join(base, "work/src/app.js")}`,
  ]);
  assert.equal(existsSync(join(base, "residue")), false);
  assert.equal(existsSync(join(base, "work/src/app.js")), true);
  assert.equal(existsSync(join(base, "checkout/.git")), true);
  assert.equal(existsSync(live), true);
});

test("residue: a repo with nothing to check reports no residue", (t) => {
  const s = scratch(t);
  assert.deepEqual(out(s.run("sweep-residue.sh", [s.repo])), ["no residue"]);
});

test("residue: a non-repository fails and a missing argument is a usage fault", (t) => {
  const s = scratch(t);
  assert.equal(s.run("sweep-residue.sh", [s.root]).status, 1);
  assert.equal(s.run("sweep-residue.sh", []).status, 2);
});

// --- run-teardown.sh ---------------------------------------------------------

function declare(s, text) {
  writeFileSync(join(s.repo, ".teamteardown"), text);
  s.git(s.repo, "add", ".teamteardown");
  s.git(s.repo, "commit", "-q", "-m", "teardown");
  s.git(s.repo, "push", "-q", "origin", "main");
}

test("teardown: each declared line runs in order with its outcome, and a failure does not stop the rest", (t) => {
  const s = scratch(t);
  declare(s, "# comment\n\necho one >> log.txt\nexit 4\ncat\necho two >> log.txt\n");

  const lines = out(s.run("run-teardown.sh", [s.repo, "feat", "/gone/wt"]));

  assert.deepEqual(lines, ["ok echo one >> log.txt", "FAILED (exit 4) exit 4", "ok cat", "ok echo two >> log.txt"]);
  assert.equal(readFileSync(join(s.repo, "log.txt"), "utf8"), "one\ntwo\n");
});

test("teardown: each line sees the repo root, branch, and worktree in its environment", (t) => {
  const s = scratch(t);
  declare(s, 'printf "%s|%s|%s" "$TEAM_REPO_ROOT" "$TEAM_BRANCH" "$TEAM_WORKTREE" > env.txt\n');
  const wt = join(s.repo, ".claude/worktrees/feat");
  s.git(s.repo, "worktree", "add", "-q", "-b", "feat", wt);

  out(s.run("run-teardown.sh", [wt, "feat"]));

  assert.equal(readFileSync(join(s.repo, "env.txt"), "utf8"), `${s.repo}|feat|`);
});

test("teardown: only the default branch's committed copy runs, preferring origin", (t) => {
  const s = scratch(t);
  declare(s, "echo origin >> ran.txt\n");
  writeFileSync(join(s.repo, ".teamteardown"), "echo local >> ran.txt\n");
  s.git(s.repo, "commit", "-q", "-am", "unpushed edit");
  writeFileSync(join(s.repo, ".teamteardown"), "echo checkout >> ran.txt\n");

  assert.deepEqual(out(s.run("run-teardown.sh", [s.repo, "feat"])), ["ok echo origin >> ran.txt"]);
  assert.equal(readFileSync(join(s.repo, "ran.txt"), "utf8"), "origin\n");
});

test("teardown: a declaration only on the finished branch never runs", (t) => {
  const s = scratch(t);
  s.git(s.repo, "switch", "-q", "-c", "feat");
  writeFileSync(join(s.repo, ".teamteardown"), "echo pwned > pwned.txt\n");
  s.git(s.repo, "add", ".teamteardown");
  s.git(s.repo, "commit", "-q", "-m", "evil");

  assert.deepEqual(out(s.run("run-teardown.sh", [s.repo, "feat"])), ["none (no .teamteardown on main)"]);
  assert.equal(existsSync(join(s.repo, "pwned.txt")), false);
});

test("teardown: a hung line times out and the rest still run", (t) => {
  const s = scratch(t);
  declare(s, "sleep 30\necho after >> log.txt\n");
  const started = Date.now();

  const lines = out(s.run("run-teardown.sh", [s.repo, "feat"], { TEAM_TEARDOWN_TIMEOUT: "1" }));

  assert.deepEqual(lines, ["TIMEOUT sleep 30", "ok echo after >> log.txt"]);
  assert.ok(Date.now() - started < 15000, "the hung line was waited out");
});

test("teardown: a non-repository is refused and bad arguments are usage faults", (t) => {
  const s = scratch(t);
  const refused = s.run("run-teardown.sh", [s.root, "feat"]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /refusing/);
  assert.equal(s.run("run-teardown.sh", [s.repo]).status, 2);
  assert.equal(s.run("run-teardown.sh", [s.repo, ""]).status, 2);
  assert.equal(s.run("run-teardown.sh", [s.repo, "feat", "", "extra"]).status, 2);
  assert.equal(s.run("run-teardown.sh", [s.repo, "feat"], { TEAM_TEARDOWN_TIMEOUT: "soon" }).status, 2);
});

test("teardown: no resolvable default branch is refused", (t) => {
  const s = scratch(t);
  s.git(s.repo, "remote", "remove", "origin");
  s.git(s.repo, "branch", "-q", "-m", "main", "trunk");
  const run = s.run("run-teardown.sh", [s.repo, "feat"]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /no default branch/);
});
