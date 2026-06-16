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

  test("retains the version-unchanged-vs-base no-op early exit (loop safety)", () => {
    // Slimmed, but the `version == base → no-op` early exit must survive so
    // the workflow no-ops for bump-less PRs and never loops on its own edit.
    const hasNoopExit = /if \[ "\$V" = "\$BASE_V" \]/.test(text);
    expect(hasNoopExit).toBe(true);
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
