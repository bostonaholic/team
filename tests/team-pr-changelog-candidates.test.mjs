// Runs skills/team-pr/scripts/changelog-candidates.mjs against scratch repos.
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-pr/scripts/changelog-candidates.mjs");

function scratchRepo(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "changelog-candidates-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: "1" };
  const repo = join(root, "repo");
  const git = (...args) => {
    const run = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };
  spawnSync("git", ["init", "-q", repo], { env });
  let counter = 0;
  const commit = (message) => {
    counter += 1;
    writeFileSync(join(repo, `file-${counter}.txt`), `${counter}\n`);
    git("add", ".");
    git("commit", "-q", "-m", message);
    return git("rev-parse", "HEAD");
  };
  const changelog = (text) => writeFileSync(join(repo, "CHANGELOG.md"), text);
  const run = () => spawnSync(process.execPath, [SCRIPT, repo], { env, encoding: "utf8" });
  return { repo, git, commit, changelog, run, env };
}

const RELEASED = "# Changelog\n\n## [Unreleased]\n\n## [1.2.0] - 2026-01-02\n\n### Added\n\n- Thing.\n\n## [1.1.0] - 2025-12-01\n";

function output(run) {
  assert.equal(run.status, 0, `exit ${run.status}: ${run.stderr}`);
  return JSON.parse(run.stdout);
}

test("the v-prefixed tag of the first versioned heading is the baseline", (t) => {
  const repo = scratchRepo(t);
  repo.changelog(RELEASED);
  repo.commit("feat: old");
  const release = repo.commit("chore: release 1.2.0");
  repo.git("tag", "v1.2.0");
  repo.commit("feat: new thing");
  const result = output(repo.run());
  assert.deepEqual(result.baseline, { version: "1.2.0", commit: release, via: "tag" });
  assert.equal(result.range, `${release}..HEAD`);
  assert.deepEqual(result.commits.map((c) => c.subject), ["feat: new thing"]);
});

test("a bare version tag resolves when no v-prefixed tag exists", (t) => {
  const repo = scratchRepo(t);
  repo.changelog(RELEASED);
  const release = repo.commit("chore: cut");
  repo.git("tag", "1.2.0");
  assert.deepEqual(output(repo.run()).baseline, { version: "1.2.0", commit: release, via: "tag" });
});

test("with no tag, the newest subject naming the version is the baseline, never a longer version", (t) => {
  const repo = scratchRepo(t);
  repo.changelog(RELEASED);
  const release = repo.commit("v1.2.0 feat: the release");
  repo.commit("v11.2.0 feat: not it");
  repo.commit("v1.2.01 feat: not it either");
  const result = output(repo.run());
  assert.deepEqual(result.baseline, { version: "1.2.0", commit: release, via: "subject" });
  assert.equal(result.commits.length, 2);
});

test("with no versioned heading every commit on HEAD is a candidate", (t) => {
  const repo = scratchRepo(t);
  repo.changelog("# Changelog\n\n## [Unreleased]\n");
  repo.commit("feat: one");
  repo.commit("fix: two");
  const result = output(repo.run());
  assert.equal(result.baseline, null);
  assert.equal(result.range, "HEAD");
  assert.deepEqual(result.commits.map((c) => c.subject), ["fix: two", "feat: one"]);
});

test("each commit carries the filter's default rule and the reason", (t) => {
  const repo = scratchRepo(t);
  repo.changelog("# Changelog\n\n## [Unreleased]\n");
  const subjects = [
    "feat(api): add",
    "fix: repair",
    "perf: faster",
    "security: patch",
    "chore: tidy",
    "test: cover",
    "refactor: move",
    "docs: explain",
    "ci: pipeline",
    "revert: undo",
    "refactor!: drop the old flag",
    "fixup! feat(api): add",
    "WIP: still debugging",
    "build: bump",
    "Update the readme",
  ];
  for (const subject of subjects) repo.commit(subject);
  const rules = Object.fromEntries(output(repo.run()).commits.map((c) => [c.subject, [c.rule, c.reason, c.type, c.breaking]]));
  assert.deepEqual(rules, {
    "feat(api): add": ["include", "feat", "feat", false],
    "fix: repair": ["include", "fix", "fix", false],
    "perf: faster": ["include", "perf", "perf", false],
    "security: patch": ["include", "security", "security", false],
    "chore: tidy": ["exclude", "chore", "chore", false],
    "test: cover": ["exclude", "test", "test", false],
    "refactor: move": ["exclude", "refactor", "refactor", false],
    "docs: explain": ["exclude", "docs", "docs", false],
    "ci: pipeline": ["exclude", "ci", "ci", false],
    "revert: undo": ["exclude", "revert", "revert", false],
    "refactor!: drop the old flag": ["include", "breaking", "refactor", true],
    "fixup! feat(api): add": ["exclude", "fixup", null, false],
    "WIP: still debugging": ["exclude", "wip", "wip", false],
    "build: bump": ["review", "unknown-type", "build", false],
    "Update the readme": ["review", "no-type", null, false],
  });
});

test("a BREAKING CHANGE footer includes an otherwise excluded type", (t) => {
  const repo = scratchRepo(t);
  repo.changelog("# Changelog\n\n## [Unreleased]\n");
  repo.commit("chore: rename config\n\nBody line.\n\nBREAKING CHANGE: the config key moved");
  const [only] = output(repo.run()).commits;
  assert.deepEqual([only.rule, only.reason, only.breaking], ["include", "breaking", true]);
});

test("a merge commit is excluded", (t) => {
  const repo = scratchRepo(t);
  repo.changelog("# Changelog\n\n## [Unreleased]\n");
  repo.commit("feat: base");
  repo.git("checkout", "-q", "-b", "side");
  repo.commit("feat: side");
  repo.git("checkout", "-q", "main");
  repo.commit("fix: main");
  repo.git("merge", "-q", "--no-ff", "-m", "feat: merge side", "side");
  const merge = output(repo.run()).commits.find((c) => c.subject === "feat: merge side");
  assert.deepEqual([merge.rule, merge.reason], ["exclude", "merge"]);
});

test("an empty range lists no commits and exits 0", (t) => {
  const repo = scratchRepo(t);
  repo.changelog(RELEASED);
  repo.commit("chore: release");
  repo.git("tag", "v1.2.0");
  assert.deepEqual(output(repo.run()).commits, []);
});

test("a missing CHANGELOG.md exits 1 and prints nothing", (t) => {
  const repo = scratchRepo(t);
  repo.commit("feat: one");
  const run = repo.run();
  assert.equal(run.status, 1);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /no CHANGELOG\.md/);
});

test("a versioned heading no tag or subject names exits 2", (t) => {
  const repo = scratchRepo(t);
  repo.changelog(RELEASED);
  repo.commit("feat: one");
  const run = repo.run();
  assert.equal(run.status, 2);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /names 1\.2\.0, but no tag/);
});

test("a repository with no commit exits 2", (t) => {
  const repo = scratchRepo(t);
  repo.changelog("# Changelog\n");
  const run = repo.run();
  assert.equal(run.status, 2);
  assert.match(run.stderr, /git rev-parse/);
});

test("a wrong argument count or a missing directory exits 2 with usage", () => {
  for (const args of [[], ["a", "b"], ["--help"]]) {
    const run = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /usage: changelog-candidates\.mjs <repo-dir>/);
  }
  const missing = spawnSync(process.execPath, [SCRIPT, "/nonexistent/repo"], { encoding: "utf8" });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /not a directory/);
});
