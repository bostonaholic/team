// tests/ci-workflows.test.ts
//
// L2 tripwire (free, deterministic): fences Slice 3 of
// docs/plans/2026-06-15-version-at-land-time — retire the per-PR version
// gate and slim the title backstop, while leaving the consuming workflows
// (release-on-merge, harness-checks) intact.
//
// Defensive reads: a missing workflow → "" so content assertions FAIL
// cleanly rather than throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const WF = (name: string) => join(REPO_ROOT, ".github", "workflows", name);

const VERSION_GATE = WF("version-gate.yml");
const PR_TITLE_SYNC = WF("pr-title-sync.yml");
const RELEASE_ON_MERGE = WF("release-on-merge.yml");
const HARNESS_CHECKS = WF("harness-checks.yml");
const VERSION_BUMP_CHECK = WF("version-bump-check.yml");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

describe("ci workflows: version gate is retired (Slice 3)", () => {
  test(".github/workflows/version-gate.yml no longer exists", () => {
    // The dev version-bump skill owns the land-time bump, and the serialized
    // land (bump-then-/shipit) replaces the per-PR gate — so the gate it
    // enforced is dead. The file is deleted.
    expect(existsSync(VERSION_GATE)).toBe(false);
  });
});

describe("ci workflows: pr-title-sync slimmed to a backstop, loop-safe (Slice 3)", () => {
  const text = readIf(PR_TITLE_SYNC);

  test("pr-title-sync.yml still exists", () => {
    expect(existsSync(PR_TITLE_SYNC)).toBe(true);
  });

  test("retains the fork-PR guard (same-repo head only)", () => {
    expect(text).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  test("retains the github-actions[bot] actor guard (loop safety)", () => {
    expect(text).toContain("github.actor != 'github-actions[bot]'");
  });

  test("delegates the version decision to pr-title-version.sh (#104)", () => {
    // The branch-relative decision (head vs merge-base, strict forward bump)
    // lives in the script so it can be pinned by deterministic git-fixture
    // tests; the workflow only acts on its output.
    expect(text).toContain(".github/scripts/pr-title-version.sh");
  });

  test("only edits the title when the script prints a non-empty result", () => {
    // The empty-output → no-op early exit keeps the workflow from touching a
    // bump-less PR's title (and from looping on its own `edited` event).
    expect(/if \[ -z "\$WANT" \]/.test(text)).toBe(true);
  });

  test("retains the already-correct no-op early exit (loop safety)", () => {
    // The rewrite fires an `edited` event that re-enters the job; with the
    // title already correct it must exit without editing, so it cannot loop.
    expect(/if \[ "\$WANT" = "\$CURRENT_TITLE" \]/.test(text)).toBe(true);
  });

  test("computes the candidate from the head SHA, not a base-tip fetch (#104)", () => {
    // Regression fence: the misfire was reading the base BRANCH TIP. The fix
    // measures the head against the merge-base, so the title is passed by
    // head.sha and the old `git fetch origin "$BASE_REF"` base-tip read is gone.
    expect(text).toContain("github.event.pull_request.head.sha");
    expect(/git fetch origin "\$BASE_REF"/.test(text)).toBe(false);
  });
});

describe("ci workflows: pr-title-version.sh decides by merge-base, not base tip (#104)", () => {
  const SCRIPT = join(REPO_ROOT, ".github", "scripts", "pr-title-version.sh");
  const src = readIf(SCRIPT);

  test("pr-title-version.sh exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  test("measures against the merge-base (fork point), not the base tip", () => {
    expect(/git merge-base/.test(src)).toBe(true);
  });
});

describe("ci workflows: runtime-vs-dev bump gate is wired on PRs (#120)", () => {
  const text = readIf(VERSION_BUMP_CHECK);

  test("version-bump-check.yml exists", () => {
    expect(existsSync(VERSION_BUMP_CHECK)).toBe(true);
  });

  test("runs on pull_request to main", () => {
    expect(/pull_request:/.test(text)).toBe(true);
    expect(/branches:\s*\[main\]/.test(text)).toBe(true);
  });

  test("delegates the decision to version-bump-required.sh", () => {
    expect(text).toContain(".github/scripts/version-bump-required.sh");
  });

  test("checks out full history so merge-base resolves", () => {
    expect(/fetch-depth:\s*0/.test(text)).toBe(true);
  });

  test("passes the head and base SHAs the script reads", () => {
    expect(text).toContain("github.event.pull_request.head.sha");
    expect(text).toContain("github.event.pull_request.base.sha");
  });
});

describe("ci workflows: version-bump-required.sh enforces the runtime-vs-dev invariant (#120)", () => {
  const SCRIPT = join(REPO_ROOT, ".github", "scripts", "version-bump-required.sh");
  const src = readIf(SCRIPT);

  test("version-bump-required.sh exists", () => {
    expect(existsSync(SCRIPT)).toBe(true);
  });

  test("measures the bump against the merge-base (fork point), not the base tip", () => {
    expect(/git merge-base/.test(src)).toBe(true);
  });
});

describe("ci workflows: consuming workflows stay intact (Slice 3)", () => {
  const release = readIf(RELEASE_ON_MERGE);
  const harness = readIf(HARNESS_CHECKS);

  test("release-on-merge.yml still exists", () => {
    expect(existsSync(RELEASE_ON_MERGE)).toBe(true);
  });

  test("release-on-merge.yml still reads plugin.json for the version", () => {
    expect(release).toContain(".claude-plugin/plugin.json");
  });

  test("release-on-merge.yml still extracts the `## [X.Y.Z]` changelog section", () => {
    // The awk extraction that turns the dated section into release notes is
    // load-bearing — Slice 3 must not touch it (design Out of scope).
    expect(release).toContain("CHANGELOG.md");
    expect(/awk[^\n]*## \\\[/.test(release)).toBe(true);
  });

  test("harness-checks.yml still exists", () => {
    expect(existsSync(HARNESS_CHECKS)).toBe(true);
  });

  test("harness-checks.yml still runs `bun test` (the free gate)", () => {
    expect(/^\s*run:\s*bun test\s*$/m.test(harness)).toBe(true);
  });
});
