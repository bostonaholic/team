// Runs skills/pr-cleanup/scripts/sweep-worktrees.sh against scratch repos with a stubbed `gh`.
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/pr-cleanup/scripts/sweep-worktrees.sh");
const OWNER = "acme";
const HAS_LSOF = spawnSync("sh", ["-c", "command -v lsof"]).status === 0;

// A clone of a bare origin with origin/HEAD set, plus a `gh` stub that answers
// `repo view` with acme/widget and `pr list` with whatever `prs` holds.
function scratchRepo(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "sweep-worktrees-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  const bin = join(root, "bin");
  mkdirSync(bin);
  const fixture = join(root, "prs.json");
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh\ncase "$1 $2" in\n  "repo view") echo ${OWNER}/widget ;;\n  "pr list") cat "${fixture}" ;;\n  *) exit 1 ;;\nesac\n`,
  );
  chmodSync(join(bin, "gh"), 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    XDG_CONFIG_HOME: root, // keeps a personal git/ignore from hiding the test's untracked files
  };

  const git = (cwd, ...args) => {
    const run = spawnSync("git", args, { cwd, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };

  const origin = join(root, "origin.git");
  git(root, "init", "-q", "--bare", origin);
  const repo = join(root, "repo");
  git(root, "clone", "-q", origin, repo);
  writeFileSync(join(repo, ".gitignore"), ".claude/worktrees/\nignored.log\n");
  git(repo, "add", ".gitignore");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "push", "-q", "origin", "main");
  git(repo, "remote", "set-head", "origin", "main");

  const prs = [];
  const writePrs = () => writeFileSync(fixture, JSON.stringify(prs));
  writePrs();

  // A worktree on its own branch with one commit; returns its path and head OID.
  const worktree = (name, path = join(repo, ".claude/worktrees", name)) => {
    git(repo, "worktree", "add", "-q", "-b", name, path);
    writeFileSync(join(path, `${name}.txt`), `${name}\n`);
    git(path, "add", ".");
    git(path, "commit", "-q", "-m", name);
    return { path, head: git(path, "rev-parse", "HEAD") };
  };

  // Lands `head` on origin/main as a squash commit and returns that commit.
  const squashMerge = (head) => {
    git(repo, "merge", "-q", "--squash", head);
    git(repo, "commit", "-q", "-m", "squash");
    git(repo, "push", "-q", "origin", "main");
    return git(repo, "rev-parse", "HEAD");
  };

  const pr = (fields) => {
    prs.push({ number: prs.length + 1, headRepositoryOwner: { login: OWNER }, mergeCommit: null, ...fields });
    writePrs();
    return prs.length;
  };
  const merged = (head) => pr({ state: "MERGED", headRefOid: head, mergeCommit: { oid: squashMerge(head) } });

  const sweep = (cwd = repo) => spawnSync("bash", [SCRIPT], { cwd, env, encoding: "utf8" });
  const branchExists = (name) =>
    spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], { cwd: repo, env }).status === 0;

  return { root, repo, git, worktree, merged, pr, sweep, branchExists };
}

function lines(run) {
  assert.equal(run.status, 0, run.stderr);
  return run.stdout.trimEnd().split("\n");
}

test("a merged, clean worktree is removed and its branch deleted", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("done");
  const number = s.merged(wt.head);

  const out = lines(s.sweep());

  assert.ok(out.includes(`removed ${wt.path} (PR #${number})`), out.join("\n"));
  assert.ok(out.includes(`branch-deleted done (PR #${number})`), out.join("\n"));
  assert.equal(existsSync(wt.path), false);
  assert.equal(s.branchExists("done"), false);
});

test("a squash merge passes the gate though the branch is not in main", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("squashed");
  s.merged(wt.head);
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", wt.head, "origin/main"], { cwd: s.repo });
  assert.notEqual(ancestor.status, 0, "precondition: the branch tip is not in main");

  const out = lines(s.sweep());

  assert.ok(out.some((line) => line.startsWith(`removed ${wt.path} `)), out.join("\n"));
});

test("a detached worktree parked at the merged PR head is removed", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("parked");
  const number = s.merged(wt.head);
  s.git(wt.path, "switch", "-q", "--detach");

  const out = lines(s.sweep());

  assert.ok(out.includes(`removed ${wt.path} (PR #${number})`), out.join("\n"));
  assert.ok(out.includes(`branch-deleted parked (PR #${number})`), out.join("\n"));
});

test("gitignored files do not block the removal", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("ignored");
  s.merged(wt.head);
  writeFileSync(join(wt.path, "ignored.log"), "log\n");

  const out = lines(s.sweep());

  assert.ok(out.some((line) => line.startsWith(`removed ${wt.path} `)), out.join("\n"));
  assert.equal(existsSync(wt.path), false);
});

test("an untracked file keeps the worktree and lists its status", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("dirty");
  s.merged(wt.head);
  writeFileSync(join(wt.path, "scratch.txt"), "work\n");

  const out = lines(s.sweep());

  const at = out.indexOf(`kept (dirty) ${wt.path}`);
  assert.notEqual(at, -1, out.join("\n"));
  assert.equal(out[at + 1], "  ?? scratch.txt");
  assert.ok(existsSync(join(wt.path, "scratch.txt")));
  assert.ok(s.branchExists("dirty"));
});

test("a HEAD with commits past the merged PR head is kept", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("ahead");
  s.merged(wt.head);
  s.git(wt.path, "commit", "-q", "--allow-empty", "-m", "new work");

  const out = lines(s.sweep());

  assert.ok(out.includes(`kept (no merged PR) ${wt.path}`), out.join("\n"));
  assert.ok(s.branchExists("ahead"));
});

test("a worktree with no PR is kept", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("wip");

  const out = lines(s.sweep());

  assert.ok(out.includes(`kept (no merged PR) ${wt.path}`), out.join("\n"));
});

test("a merged PR from a fork with the same head commit does not pass the gate", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("forked");
  s.pr({ state: "MERGED", headRefOid: wt.head, headRepositoryOwner: { login: "mallory" }, mergeCommit: { oid: s.git(s.repo, "rev-parse", "HEAD") } });

  const out = lines(s.sweep());

  assert.ok(out.includes(`kept (no merged PR) ${wt.path}`), out.join("\n"));
});

test("a closed PR keeps the worktree and names the abandon command", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("closed");
  const number = s.pr({ state: "CLOSED", headRefOid: wt.head });

  const out = lines(s.sweep());

  assert.ok(out.includes(`kept (PR #${number} closed — abandon with /pr-cleanup ${number}) ${wt.path}`), out.join("\n"));
});

test("a merged worktree outside .claude/worktrees is reported, not removed", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("elsewhere", join(s.root, "elsewhere"));
  s.merged(wt.head);

  const out = lines(s.sweep());

  assert.ok(out.includes(`report-only (git -C ${s.repo} worktree remove ${wt.path})`), out.join("\n"));
  assert.ok(existsSync(wt.path));
  assert.ok(s.branchExists("elsewhere"));
});

test("the worktree holding the invoking directory is kept", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("current");
  s.merged(wt.head);

  const out = lines(s.sweep(wt.path));

  assert.ok(out.includes(`kept (current session — next teardown removes it) ${wt.path}`), out.join("\n"));
  assert.ok(existsSync(wt.path));
});

test("a worktree that is a live process's working directory is kept", { skip: !HAS_LSOF && "lsof unavailable" }, async (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("busy");
  s.merged(wt.head);
  const child = spawn("sleep", ["60"], { cwd: wt.path, stdio: "ignore" });
  t.after(() => child.kill());
  await new Promise((done) => child.once("spawn", done));

  const out = lines(s.sweep());

  assert.ok(out.includes(`kept (in use) ${wt.path}`), out.join("\n"));
});

test("a worktree whose directory was deleted by hand is pruned", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("vanished");
  rmSync(wt.path, { recursive: true, force: true });

  const out = lines(s.sweep());

  assert.ok(out.includes("pruned worktrees/vanished: gitdir file points to non-existent location"), out.join("\n"));
});

test("a merged branch with no worktree is deleted", (t) => {
  const s = scratchRepo(t);
  s.git(s.repo, "branch", "orphan");
  s.git(s.repo, "switch", "-q", "orphan");
  writeFileSync(join(s.repo, "orphan.txt"), "orphan\n");
  s.git(s.repo, "add", ".");
  s.git(s.repo, "commit", "-q", "-m", "orphan");
  const head = s.git(s.repo, "rev-parse", "HEAD");
  s.git(s.repo, "switch", "-q", "main");
  const number = s.merged(head);

  const out = lines(s.sweep());

  assert.ok(out.includes(`branch-deleted orphan (PR #${number})`), out.join("\n"));
  assert.equal(s.branchExists("orphan"), false);
});

test("malformed gh output stops the sweep before it changes anything", (t) => {
  const s = scratchRepo(t);
  const wt = s.worktree("unknown");
  s.merged(wt.head);
  writeFileSync(join(s.root, "prs.json"), "not json");

  const run = s.sweep();

  assert.equal(run.status, 1);
  assert.match(run.stderr, /did not return a JSON array/);
  assert.ok(existsSync(wt.path));
});
