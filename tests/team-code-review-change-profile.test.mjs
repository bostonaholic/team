// Runs skills/team-code-review/scripts/change-profile.mjs against scratch repositories.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = resolve("skills/team-code-review/scripts/change-profile.mjs");

const BEFORE = "one\ntwo\nthree\n";
const AFTER = "one\n2\nthree\n"; // a one-line edit of BEFORE: 1 added, 1 deleted

// A repository with isolated git config and no commits yet.
function scratchRepo(t, { objectFormat } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "change-profile-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const gitconfig = join(root, "gitconfig");
  writeFileSync(gitconfig, "[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    XDG_CONFIG_HOME: root,
    LC_ALL: "C",
  };
  const repo = join(root, "repo");
  mkdirSync(repo);
  const git = (...args) => {
    const run = spawnSync("git", args, { cwd: repo, env, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")}: ${run.stderr}`);
    return run.stdout.trim();
  };
  git("init", "-q", ...(objectFormat ? [`--object-format=${objectFormat}`] : []));
  const write = (path, content) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  const remove = (path) => rmSync(join(repo, path));
  const commit = (message) => {
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", message);
    return git("rev-parse", "HEAD");
  };
  return { root, repo, env, git, write, remove, commit };
}

// `count` distinct newline-terminated lines.
function textOfLines(count) {
  return Array.from({ length: count }, (_, i) => `line ${i + 1}\n`).join("");
}

// Adds `files` new text files holding `lines` lines in total, spread over `areas` top-level directories.
function writeSpread(r, { areas, files, lines }) {
  for (let i = 0; i < files; i++) {
    const count = Math.floor(lines / files) + (i < lines % files ? 1 : 0);
    r.write(`p${(i % areas) + 1}/f${i + 1}.txt`, textOfLines(count));
  }
}

function profile(env, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: "utf8" });
}

function assertProfile(run, expected) {
  assert.equal(run.status, 0, `exit ${run.status}, stderr: ${run.stderr}`);
  assert.equal(run.stdout, expected);
}

function assertOneLineFault(run) {
  assert.equal(run.status, 2, `exit ${run.status}, stderr: ${run.stderr}`);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /^change-profile\.mjs: [^\n]+\n?$/);
}

function emptyBinDir(r) {
  const empty = join(r.root, "empty-bin");
  mkdirSync(empty);
  return empty;
}

// Slice 1: light review for a small, low-risk change.

test("change-profile prints the six-line profile and the light or standard depth for a valid range", async (t) => {
  await t.test("a one-line edit of src/format/date.ts is light (caller example 1)", (t) => {
    const r = scratchRepo(t);
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/format/date.ts", AFTER);
    const head = r.commit("edit");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("20 lines in 3 files stays light", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/a.ts", textOfLines(7));
    r.write("src/b.ts", textOfLines(7));
    r.write("src/c.ts", textOfLines(6));
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=20\nfiles=3\nareas=1\nrisk=none\n");
  });

  await t.test("21 lines in one file is standard", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/a.ts", textOfLines(21));
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=standard\nlines=21\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("4 one-line files is standard", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/a.ts", "a\n");
    r.write("src/b.ts", "b\n");
    r.write("src/c.ts", "c\n");
    r.write("src/d.ts", "d\n");
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=standard\nlines=4\nfiles=4\nareas=1\nrisk=none\n");
  });

  await t.test("a commit and its revert count nothing and are light", (t) => {
    const r = scratchRepo(t);
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/format/date.ts", AFTER);
    const edit = r.commit("edit");
    r.git("revert", "--no-edit", edit);
    const head = r.git("rev-parse", "HEAD");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=0\nfiles=0\nareas=0\nrisk=none\n");
  });

  await t.test("a binary file adds one file and no lines", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("assets/logo.png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03, 0x00, 0xff]));
    const head = r.commit("add binary");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=0\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("a pure rename adds one file, no lines, both areas, and removal", (t) => {
    const r = scratchRepo(t);
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.remove("src/format/date.ts");
    r.write("lib/date.ts", BEFORE);
    const head = r.commit("rename");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=light\nlines=0\nfiles=1\nareas=2\nrisk=removal\n");
  });

  await t.test("a path with a space, a tab, a newline, and non-ASCII bytes counts as one file", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/we ird\tna\nmé.ts", "x\n");
    const head = r.commit("odd path");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=1\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("README.md, src/index.ts, and src/format/date.ts are 3 areas", (t) => {
    const r = scratchRepo(t);
    r.write("README.md", BEFORE);
    r.write("src/index.ts", BEFORE);
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.write("README.md", AFTER);
    r.write("src/index.ts", AFTER);
    r.write("src/format/date.ts", AFTER);
    const head = r.commit("edit");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=6\nfiles=3\nareas=3\nrisk=none\n");
  });

  await t.test("a SHA-256 repository with a one-line edit prints the caller example 1 profile", (t) => {
    const r = scratchRepo(t, { objectFormat: "sha256" });
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/format/date.ts", AFTER);
    const head = r.commit("edit");
    assert.equal(head.length, 64, "fixture is not a SHA-256 repository");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("commits after the head SHA and uncommitted edits leave the output unchanged", (t) => {
    const r = scratchRepo(t);
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/format/date.ts", AFTER);
    const head = r.commit("edit");
    r.write("src/auth/token.ts", textOfLines(30));
    r.commit("later commit");
    r.write("src/format/date.ts", "uncommitted\n");
    r.write("scratch.txt", "untracked\n");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("a run leaves git status unchanged", (t) => {
    const r = scratchRepo(t);
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/format/date.ts", AFTER);
    const head = r.commit("edit");
    const run = profile(r.env, r.repo, base, head);
    assert.equal(run.status, 0, `exit ${run.status}, stderr: ${run.stderr}`);
    assert.equal(r.git("status", "--porcelain", "--untracked-files=all"), "");
  });
});

test("change-profile raises a light change to standard on any risk class", async (t) => {
  await t.test("src/auth/SessionStore.ts is sensitive-path (caller example 2)", (t) => {
    const r = scratchRepo(t);
    r.write("src/auth/SessionStore.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/auth/SessionStore.ts", AFTER);
    const head = r.commit("edit");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=sensitive-path\n");
  });

  await t.test("src/JWTVerifier.ts is sensitive-path through the acronym split", (t) => {
    const r = scratchRepo(t);
    r.write("src/JWTVerifier.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/JWTVerifier.ts", AFTER);
    const head = r.commit("edit");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=sensitive-path\n");
  });

  await t.test("db/migrations/0042.sql is sensitive-path through the term-plus-s rule", (t) => {
    const r = scratchRepo(t);
    r.write("db/migrations/0042.sql", BEFORE);
    const base = r.commit("base");
    r.write("db/migrations/0042.sql", AFTER);
    const head = r.commit("edit");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=sensitive-path\n");
  });

  await t.test("src/author.ts contains a term but matches none, so it stays light", (t) => {
    const r = scratchRepo(t);
    r.write("src/author.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/author.ts", AFTER);
    const head = r.commit("edit");
    assertProfile(profile(r.env, r.repo, base, head), "depth=light\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test(".github/workflows/ci.yml is config", (t) => {
    const r = scratchRepo(t);
    r.write(".github/workflows/ci.yml", BEFORE);
    const base = r.commit("base");
    r.write(".github/workflows/ci.yml", AFTER);
    const head = r.commit("edit");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=config\n");
  });

  await t.test("a deleted src/old.ts is removal", (t) => {
    const r = scratchRepo(t);
    r.write("src/old.ts", textOfLines(3));
    const base = r.commit("base");
    r.remove("src/old.ts");
    const head = r.commit("delete");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=light\nlines=3\nfiles=1\nareas=1\nrisk=removal\n");
  });

  await t.test("two worktrees with a one-line edit each are multi-repo, with areas summed per range", (t) => {
    const api = scratchRepo(t);
    api.write("src/format/date.ts", BEFORE);
    const apiBase = api.commit("base");
    api.write("src/format/date.ts", AFTER);
    const apiHead = api.commit("edit");
    const web = scratchRepo(t);
    web.write("src/format/date.ts", BEFORE);
    const webBase = web.commit("base");
    web.write("src/format/date.ts", AFTER);
    const webHead = web.commit("edit");
    assertProfile(
      profile(api.env, api.repo, apiBase, apiHead, web.repo, webBase, webHead),
      "depth=standard\nbase_depth=light\nlines=4\nfiles=2\nareas=2\nrisk=multi-repo\n",
    );
  });

  await t.test("a deleted .eslintrc is config and removal, in byte order", (t) => {
    const r = scratchRepo(t);
    r.write(".eslintrc", "{\n}\n");
    const base = r.commit("base");
    r.remove(".eslintrc");
    const head = r.commit("delete");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=light\nlines=2\nfiles=1\nareas=1\nrisk=config,removal\n");
  });
});

test("change-profile exits 2 with one stderr line on each fault", async (t) => {
  await t.test("zero arguments print the usage line", (t) => {
    const r = scratchRepo(t);
    const run = profile(r.env);
    assertOneLineFault(run);
    assert.equal(run.stderr.trimEnd(), "change-profile.mjs: usage: change-profile.mjs <worktree-path> <merge-base-sha> <head-sha> [...]");
  });

  await t.test("two arguments print the usage line", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    const run = profile(r.env, r.repo, base);
    assertOneLineFault(run);
    assert.equal(run.stderr.trimEnd(), "change-profile.mjs: usage: change-profile.mjs <worktree-path> <merge-base-sha> <head-sha> [...]");
  });

  await t.test("four arguments print the usage line", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    const run = profile(r.env, r.repo, base, base, r.repo);
    assertOneLineFault(run);
    assert.equal(run.stderr.trimEnd(), "change-profile.mjs: usage: change-profile.mjs <worktree-path> <merge-base-sha> <head-sha> [...]");
  });

  await t.test("a 39-character SHA fails before any git call", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    const run = profile({ ...r.env, PATH: emptyBinDir(r) }, r.repo, base, "abcdef0123456789abcdef0123456789abcdef0");
    assertOneLineFault(run);
    assert.doesNotMatch(run.stderr, /git not found|usage:/);
    assert.ok(run.stderr.includes("abcdef0123456789abcdef0123456789abcdef0"), `stderr does not name the bad SHA: ${run.stderr}`);
  });

  await t.test("an uppercase SHA fails before any git call", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    const run = profile({ ...r.env, PATH: emptyBinDir(r) }, r.repo, base, "ABCDEF0123456789ABCDEF0123456789ABCDEF01");
    assertOneLineFault(run);
    assert.doesNotMatch(run.stderr, /git not found|usage:/);
    assert.ok(run.stderr.includes("ABCDEF0123456789ABCDEF0123456789ABCDEF01"), `stderr does not name the bad SHA: ${run.stderr}`);
  });

  await t.test("a value that starts with - fails before any git call", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    const run = profile({ ...r.env, PATH: emptyBinDir(r) }, r.repo, base, "--stat");
    assertOneLineFault(run);
    assert.doesNotMatch(run.stderr, /git not found|usage:/);
    assert.ok(run.stderr.includes("--stat"), `stderr does not name the bad value: ${run.stderr}`);
  });

  await t.test("a path outside any git worktree prints git's first stderr line", (t) => {
    const r = scratchRepo(t);
    const outside = join(r.root, "outside");
    mkdirSync(outside);
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const run = profile({ ...r.env, GIT_CEILING_DIRECTORIES: r.root }, outside, sha, sha);
    assertOneLineFault(run);
    assert.ok(
      run.stderr.startsWith(`change-profile.mjs: git diff failed in ${outside}: `),
      `stderr does not name the failed git read: ${run.stderr}`,
    );
    assert.notEqual(run.stderr.trimEnd(), `change-profile.mjs: git diff failed in ${outside}:`);
  });

  await t.test("a well-formed SHA that names no commit prints git's first stderr line and no partial stdout", (t) => {
    const good = scratchRepo(t);
    good.write("src/format/date.ts", BEFORE);
    const goodBase = good.commit("base");
    good.write("src/format/date.ts", AFTER);
    const goodHead = good.commit("edit");
    const bad = scratchRepo(t);
    const badBase = bad.commit("base");
    const run = profile(good.env, good.repo, goodBase, goodHead, bad.repo, badBase, "0123456789abcdef0123456789abcdef01234567");
    assertOneLineFault(run);
    assert.equal(
      run.stderr.trimEnd(),
      `change-profile.mjs: git diff failed in ${bad.repo}: fatal: bad object 0123456789abcdef0123456789abcdef01234567`,
    );
  });

  await t.test("a missing git prints git not found on PATH", (t) => {
    const r = scratchRepo(t);
    r.write("src/format/date.ts", BEFORE);
    const base = r.commit("base");
    r.write("src/format/date.ts", AFTER);
    const head = r.commit("edit");
    const run = profile({ ...r.env, PATH: emptyBinDir(r) }, r.repo, base, head);
    assertOneLineFault(run);
    assert.equal(run.stderr.trimEnd(), "change-profile.mjs: git not found on PATH");
  });
});

// Slice 2: deep review for a large or risky change.

test("change-profile picks deep past the standard limits", async (t) => {
  await t.test("400 lines in 20 files across 6 areas stays standard", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    writeSpread(r, { areas: 6, files: 20, lines: 400 });
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=standard\nlines=400\nfiles=20\nareas=6\nrisk=none\n");
  });

  await t.test("401 lines is deep", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    writeSpread(r, { areas: 6, files: 20, lines: 401 });
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=deep\nbase_depth=deep\nlines=401\nfiles=20\nareas=6\nrisk=none\n");
  });

  await t.test("21 files is deep", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    writeSpread(r, { areas: 6, files: 21, lines: 400 });
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=deep\nbase_depth=deep\nlines=400\nfiles=21\nareas=6\nrisk=none\n");
  });

  await t.test("7 areas is deep", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    writeSpread(r, { areas: 7, files: 20, lines: 400 });
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=deep\nbase_depth=deep\nlines=400\nfiles=20\nareas=7\nrisk=none\n");
  });

  await t.test("100 lines is standard", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/a.ts", textOfLines(100));
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=standard\nbase_depth=standard\nlines=100\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("1,000 lines is deep", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/a.ts", textOfLines(1000));
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=deep\nbase_depth=deep\nlines=1000\nfiles=1\nareas=1\nrisk=none\n");
  });

  await t.test("10,000 lines is deep", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/a.ts", textOfLines(10000));
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=deep\nbase_depth=deep\nlines=10000\nfiles=1\nareas=1\nrisk=none\n");
  });
});

test("change-profile raises a standard change to deep on any risk class", async (t) => {
  await t.test("a deleted 25-line file is removal and deep", (t) => {
    const r = scratchRepo(t);
    r.write("src/old.ts", textOfLines(25));
    const base = r.commit("base");
    r.remove("src/old.ts");
    const head = r.commit("delete");
    assertProfile(profile(r.env, r.repo, base, head), "depth=deep\nbase_depth=standard\nlines=25\nfiles=1\nareas=1\nrisk=removal\n");
  });

  await t.test("two worktrees with 25 changed lines in total are multi-repo and deep", (t) => {
    const api = scratchRepo(t);
    const apiBase = api.commit("base");
    api.write("src/a.ts", textOfLines(13));
    const apiHead = api.commit("add");
    const web = scratchRepo(t);
    const webBase = web.commit("base");
    web.write("src/b.ts", textOfLines(12));
    const webHead = web.commit("add");
    assertProfile(
      profile(api.env, api.repo, apiBase, apiHead, web.repo, webBase, webHead),
      "depth=deep\nbase_depth=standard\nlines=25\nfiles=2\nareas=2\nrisk=multi-repo\n",
    );
  });

  await t.test("401 lines under src/auth/ stay deep", (t) => {
    const r = scratchRepo(t);
    const base = r.commit("base");
    r.write("src/auth/handler.ts", textOfLines(401));
    const head = r.commit("add");
    assertProfile(profile(r.env, r.repo, base, head), "depth=deep\nbase_depth=deep\nlines=401\nfiles=1\nareas=1\nrisk=sensitive-path\n");
  });
});
