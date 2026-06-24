// tests/pr-title-version.test.ts
//
// Deterministic behavioral tests for the PR-title version decision,
// `.github/scripts/pr-title-version.sh`. The script prints the desired PR title
// when the title should be rewritten, and NOTHING when the workflow should leave
// it alone — a function of (head version, fork-point version, current title).
//
// L3/L4 per docs/testing.md (real git, no model/network — free, gate-tier). The
// git merge-base computation IS the subject, so each case stands up a real git
// fixture rather than asserting on the YAML source.
//
// Regression for #104: pr-title-sync re-stamped a stale base version onto a PR
// whose branch was behind a version-bumped `main`. The fix decides the version
// from what the BRANCH changed — head version vs the MERGE-BASE (fork point),
// stamping only on a strict forward bump — so a bump-less PR no-ops no matter how
// far `main` has advanced.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, ".github", "scripts", "pr-title-version.sh");

const HAS_JQ = spawnSync("jq", ["--version"]).status === 0;

// Hermetic temp repo keyed by pid+timestamp (docs/testing.md), cleaned up after.
const fixtures: string[] = [];
afterAll(() => {
  for (const dir of fixtures) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return (r.stdout ?? "").trim();
}

// Write plugin.json at `version` and commit it; return the new commit SHA.
function commitVersion(cwd: string, version: string, message: string) {
  mkdirSync(join(cwd, ".claude-plugin"), { recursive: true });
  writeFileSync(
    join(cwd, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "team", version }, null, 2) + "\n",
  );
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), `pr-title-${process.pid}-`));
  fixtures.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  return dir;
}

// Build: fork point at `fork`, then advance main to each of `mainBumps`, and lay
// the branch's own commits (`branchVersions`) on top of the fork point.
function scenario(opts: {
  fork: string;
  mainBumps: string[];
  branchVersions: string[];
}) {
  const dir = newRepo();
  commitVersion(dir, opts.fork, `chore: fork at ${opts.fork}`);
  const forkSha = git(dir, "rev-parse", "HEAD");
  git(dir, "branch", "feature", forkSha);

  // main advances past the fork (the version-bumped base from #104).
  for (const v of opts.mainBumps) commitVersion(dir, v, `chore(version): ${v}`);
  const baseSha = git(dir, "rev-parse", "main");

  // the PR branch's own work.
  git(dir, "checkout", "-q", "feature");
  for (const v of opts.branchVersions) commitVersion(dir, v, `work: ${v}`);
  const headSha = git(dir, "rev-parse", "HEAD");

  return { dir, headSha, baseSha };
}

function run(
  cwd: string,
  env: { HEAD_SHA: string; BASE_SHA: string; CURRENT_TITLE?: string },
) {
  const r = spawnSync("bash", [SCRIPT], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      HEAD_SHA: env.HEAD_SHA,
      BASE_SHA: env.BASE_SHA,
      CURRENT_TITLE: env.CURRENT_TITLE ?? "",
    },
  });
  return { status: r.status, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
}

describe.if(HAS_JQ)("pr-title-version.sh: branch-relative version decision", () => {
  // The #104 repro: branch forked at 0.8.0, never bumped; main advanced to
  // 0.9.1 since the fork. The title must NOT be stamped — the PR ships no bump.
  test("regression #104: bump-less PR behind a bumped main → no-op", () => {
    const { dir, headSha, baseSha } = scenario({
      fork: "0.8.0",
      mainBumps: ["0.9.0", "0.9.1"],
      branchVersions: [],
    });
    const r = run(dir, {
      HEAD_SHA: headSha,
      BASE_SHA: baseSha,
      CURRENT_TITLE: "Fix the thing",
    });
    expect(r.status).toBe(0);
    expect(r.out).toBe("");
  });

  // Even when a maintainer's manual strip left a clean title, a bump-less PR
  // behind a bumped main must still no-op so the strip holds.
  test("regression #104: bump-less PR, plain title stays plain", () => {
    const { dir, headSha, baseSha } = scenario({
      fork: "0.8.0",
      mainBumps: ["0.9.1"],
      branchVersions: [],
    });
    const r = run(dir, {
      HEAD_SHA: headSha,
      BASE_SHA: baseSha,
      CURRENT_TITLE: "Park the CI author-gate PR",
    });
    expect(r.out).toBe("");
  });

  // A branch that lowers the version below its fork point (revert) is not a
  // forward bump → no-op, regardless of where the base tip sits.
  test("branch version below the fork point → no-op", () => {
    const { dir, headSha, baseSha } = scenario({
      fork: "0.8.0",
      mainBumps: ["0.9.1"],
      branchVersions: ["0.7.0"],
    });
    const r = run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha });
    expect(r.out).toBe("");
  });

  // A genuine bump (branch moves the version strictly forward of its fork
  // point) is still stamped — the happy path the workflow exists for.
  test("genuine forward bump → stamps v<new>", () => {
    const { dir, headSha, baseSha } = scenario({
      fork: "0.8.0",
      mainBumps: ["0.9.1"],
      branchVersions: ["0.9.0"],
    });
    const r = run(dir, {
      HEAD_SHA: headSha,
      BASE_SHA: baseSha,
      CURRENT_TITLE: "Some PR title",
    });
    expect(r.out).toBe("v0.9.0 Some PR title");
  });

  // The rewrite fires an `edited` event that re-enters the workflow; with the
  // title already correct the script must no-op so it cannot loop.
  test("loop safety: already-correct title on a real bump → no-op", () => {
    const { dir, headSha, baseSha } = scenario({
      fork: "0.8.0",
      mainBumps: ["0.9.1"],
      branchVersions: ["0.9.0"],
    });
    const r = run(dir, {
      HEAD_SHA: headSha,
      BASE_SHA: baseSha,
      CURRENT_TITLE: "v0.9.0 Some PR title",
    });
    expect(r.out).toBe("");
  });

  // A real bump replaces a stale prefix rather than doubling it.
  test("real bump restamps a stale prefix in place", () => {
    const { dir, headSha, baseSha } = scenario({
      fork: "0.8.0",
      mainBumps: ["0.9.1"],
      branchVersions: ["0.9.0"],
    });
    const r = run(dir, {
      HEAD_SHA: headSha,
      BASE_SHA: baseSha,
      CURRENT_TITLE: "v0.8.5 Some PR title",
    });
    expect(r.out).toBe("v0.9.0 Some PR title");
  });
});

describe.if(HAS_JQ)("pr-title-version.sh: input validation", () => {
  test("rejects a non-semver head version", () => {
    const dir = newRepo();
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(
      join(dir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "team", version: "1.2" }) + "\n",
    );
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "bad version");
    const sha = git(dir, "rev-parse", "HEAD");
    const r = run(dir, { HEAD_SHA: sha, BASE_SHA: sha });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/not 3-part semver/);
  });
});
