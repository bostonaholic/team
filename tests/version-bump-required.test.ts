// tests/version-bump-required.test.ts
//
// Deterministic behavioral tests for the runtime-vs-dev bump gate,
// `.github/scripts/version-bump-required.sh`. The script enforces the land-time
// versioning invariant of #120: a PR that changes the DISTRIBUTED PLUGIN
// (agents/, skills/, hooks/, .claude-plugin/ *content*) must carry a forward
// version bump; a PR that changes only contributor/dev infrastructure (.github/,
// .claude/, docs/, tests/, evals/) must NOT bump. It decides "did the branch
// bump?" from the head version vs the MERGE-BASE (fork point) version — the same
// branch-relative measure as pr-title-version.sh — and "did runtime change?" from
// the fork-point..HEAD diff. Exit 0 = invariant holds; non-zero = violation.
//
// L3/L4 per docs/testing.md (real git, no model/network — free, gate-tier). The
// git merge-base + diff computation IS the subject, so each case stands up a real
// git fixture rather than asserting on the YAML/SKILL source.
//
// Regression for #120: version-bump bumped #118 (a .github/-only CI fix)
// 0.13.1 -> 0.13.2 and cut a changelog section. No deterministic check caught it.

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, ".github", "scripts", "version-bump-required.sh");

const HAS_JQ = spawnSync("jq", ["--version"]).status === 0;

// Hermetic temp repos keyed by pid+timestamp (docs/testing.md), cleaned up after.
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

function writeFile(cwd: string, relPath: string, content: string) {
  const abs = join(cwd, relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

// Write .claude-plugin/plugin.json at `version` (carrying some real content so a
// content edit is distinguishable from a version-only edit).
function writePlugin(cwd: string, version: string, description = "Team plugin") {
  writeFile(
    cwd,
    ".claude-plugin/plugin.json",
    JSON.stringify({ name: "team", version, description }, null, 2) + "\n",
  );
}

function commit(cwd: string, message: string) {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

function newRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), `vbreq-${process.pid}-`));
  fixtures.push(dir);
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  return dir;
}

// Build a repo forked at `forkVersion`, advance main by `mainBumps`, then lay the
// branch's own edits via `branchEdits(dir)` (which mutates files + may bump).
function scenario(opts: {
  forkVersion: string;
  mainBumps?: string[];
  branchEdits: (dir: string) => void;
}) {
  const dir = newRepo();
  writePlugin(dir, opts.forkVersion);
  writeFile(dir, "README.md", "# fork\n");
  commit(dir, `chore: fork at ${opts.forkVersion}`);
  const forkSha = git(dir, "rev-parse", "HEAD");
  git(dir, "branch", "feature", forkSha);

  for (const v of opts.mainBumps ?? []) {
    writePlugin(dir, v);
    commit(dir, `chore(version): ${v}`);
  }
  const baseSha = git(dir, "rev-parse", "main");

  git(dir, "checkout", "-q", "feature");
  opts.branchEdits(dir);
  const headSha = commit(dir, "work");

  return { dir, headSha, baseSha };
}

function run(cwd: string, env: { HEAD_SHA: string; BASE_SHA: string }) {
  const r = spawnSync(SCRIPT, [], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HEAD_SHA: env.HEAD_SHA, BASE_SHA: env.BASE_SHA },
  });
  return { status: r.status, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
}

describe.if(HAS_JQ)("version-bump-required.sh: the runtime-vs-dev bump invariant", () => {
  // The #118 case: a .github/-only CI fix, no bump. The invariant holds.
  test("dev-only change, no bump → ok (exit 0)", () => {
    const { dir, headSha, baseSha } = scenario({
      forkVersion: "0.13.1",
      branchEdits: (d) => writeFile(d, ".github/workflows/ci.yml", "name: ci\n"),
    });
    expect(run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha }).status).toBe(0);
  });

  // The #118 MISTAKE: a .github/-only diff that nonetheless bumped the version.
  test("dev-only change WITH a bump → violation (non-zero)", () => {
    const { dir, headSha, baseSha } = scenario({
      forkVersion: "0.13.1",
      branchEdits: (d) => {
        writeFile(d, ".github/workflows/ci.yml", "name: ci\n");
        writePlugin(d, "0.13.2"); // the wrong bump
      },
    });
    expect(run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha }).status).not.toBe(0);
  });

  // A real runtime change must carry a bump.
  test("runtime change WITHOUT a bump → violation (non-zero)", () => {
    const { dir, headSha, baseSha } = scenario({
      forkVersion: "0.13.1",
      branchEdits: (d) => writeFile(d, "skills/foo/SKILL.md", "# foo\n"),
    });
    expect(run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha }).status).not.toBe(0);
  });

  // The happy path: runtime change + forward bump.
  test("runtime change WITH a forward bump → ok (exit 0)", () => {
    const { dir, headSha, baseSha } = scenario({
      forkVersion: "0.13.1",
      branchEdits: (d) => {
        writeFile(d, "agents/planner.md", "# planner\n");
        writePlugin(d, "0.14.0");
      },
    });
    expect(run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha }).status).toBe(0);
  });

  // .claude-plugin/ *content* (not the version field) is runtime — a description
  // change without a bump is a violation. Proves version-only edits and content
  // edits are distinguished.
  test(".claude-plugin content change WITHOUT a bump → violation (non-zero)", () => {
    const { dir, headSha, baseSha } = scenario({
      forkVersion: "0.13.1",
      branchEdits: (d) => writePlugin(d, "0.13.1", "A new user-facing description"),
    });
    expect(run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha }).status).not.toBe(0);
  });

  // docs-only change with no bump is fine (docs/ is contributor-facing).
  test("docs-only change, no bump → ok (exit 0)", () => {
    const { dir, headSha, baseSha } = scenario({
      forkVersion: "0.13.1",
      branchEdits: (d) => writeFile(d, "docs/versioning.md", "# versioning\n"),
    });
    expect(run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha }).status).toBe(0);
  });

  // A bump-less runtime PR behind a version-bumped main must still be measured
  // against the FORK POINT, not the base tip (#104 lesson) — so it reads as
  // "no bump" and trips the runtime-without-bump rule, not a false "bumped".
  test("branch-relative: bump-less runtime PR behind a bumped main → violation", () => {
    const { dir, headSha, baseSha } = scenario({
      forkVersion: "0.13.1",
      mainBumps: ["0.14.0"],
      branchEdits: (d) => writeFile(d, "skills/foo/SKILL.md", "# foo\n"),
    });
    expect(run(dir, { HEAD_SHA: headSha, BASE_SHA: baseSha }).status).not.toBe(0);
  });
});

describe.if(HAS_JQ)("version-bump-required.sh: input validation", () => {
  test("rejects a non-semver head version", () => {
    const dir = newRepo();
    writeFile(
      dir,
      ".claude-plugin/plugin.json",
      JSON.stringify({ name: "team", version: "1.2" }) + "\n",
    );
    const sha = commit(dir, "bad version");
    const r = run(dir, { HEAD_SHA: sha, BASE_SHA: sha });
    expect(r.status).not.toBe(0);
    expect(r.err).toMatch(/semver/);
  });
});
