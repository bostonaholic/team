// L2 contract tests for the compressed bug-fix entry point. Worktree mechanics
// belong to team-worktree; this file pins delegation and mutation gates without
// duplicating executable shell in prose.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const ROOT = process.cwd();
const TEAM_FIX = join(ROOT, "skills", "team-fix", "SKILL.md");
const TEAM_WORKTREE = join(ROOT, "skills", "team-worktree", "SKILL.md");

describe("team-fix: compressed pipeline", () => {
  test("runtime skill exists and orders WORKTREE before REPRODUCE", () => {
    expect(existsSync(TEAM_FIX)).toBe(true);
    const text = read(TEAM_FIX);
    expect(text.indexOf("WORKTREE")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("REPRODUCE")).toBeGreaterThan(text.indexOf("WORKTREE"));
  });

  test("setup, fix, and draft-PR sections stay ordered", () => {
    const text = read(TEAM_FIX);
    const setup = text.indexOf("## Setup");
    const fix = text.indexOf("## Fix");
    const draft = text.indexOf("## Draft PR");
    expect(setup).toBeGreaterThanOrEqual(0);
    expect(fix).toBeGreaterThan(setup);
    expect(draft).toBeGreaterThan(fix);
  });

  test("delegates isolation to the hidden WORKTREE module", () => {
    expect(loadsSkill(read(TEAM_FIX), "team-worktree")).toBe(true);
    expect(loadsSkill(read(TEAM_WORKTREE), "worktree-isolation")).toBe(true);
  });

  test("passes only the artifact path, then owns its task record", () => {
    const text = read(TEAM_FIX);
    const setupStart = text.indexOf("## Setup");
    const setupEnd = text.indexOf("## Fix", setupStart);
    expect(setupStart).toBeGreaterThanOrEqual(0);
    expect(setupEnd).toBeGreaterThan(setupStart);
    const setup = text.slice(setupStart, setupEnd);

    const dispatchStart = setup.indexOf("Call the Skill tool with `team-worktree`");
    const taskStart = setup.indexOf("1-task.md", dispatchStart);
    expect(dispatchStart).toBeGreaterThanOrEqual(0);
    expect(taskStart).toBeGreaterThan(dispatchStart);
    const dispatch = setup.slice(dispatchStart, taskStart);
    expect(dispatch).toContain("`docs/plans/<id>/` path as `$ARGUMENTS`");
    for (const forbidden of ["ticketId", "workflow: team-fix", "dispatch context"]) {
      expect(`positive control: ${forbidden}`).toContain(forbidden);
      expect(dispatch).not.toContain(forbidden);
    }

    const task = setup.slice(taskStart);
    for (const field of [
      "phase: task",
      "ticketId",
      "workflow: team-fix",
      "## Request",
    ]) {
      expect(task).toContain(field);
    }
    expect(task).toContain("Re-read the artifact");
  });

  test("requires test-first root-cause repair and static verification", () => {
    const text = squash(read(TEAM_FIX));
    expect(loadsSkill(read(TEAM_FIX), "test-driven-bug-fix")).toBe(true);
    expect(text).toContain("Fix the root cause, not the symptom");
    expect(text).toContain("mechanical gate");
    expect(text).toContain("typecheck");
  });

  test("signed commits precede a draft PR from a non-default branch", () => {
    const text = squash(read(TEAM_FIX));
    expect(text).toContain("Both commits must be signed and verified");
    expect(text).toContain("Recheck that HEAD is not the default branch");
    expect(text).toContain("open a draft PR");
    expect(text).toContain("body through a file");
    expect(text).toContain("write `10-pr.md`");
  });

  test("never permits committing wherever HEAD happens to sit", () => {
    const text = squash(read(TEAM_FIX));
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("commit to the working branch");
  });
});

describe("team-worktree: branch isolation owned once", () => {
  test("creates from origin/HEAD and records an explicit isolation fallback", () => {
    const text = squash(read(TEAM_WORKTREE));
    expect(text).toContain("worktree add .claude/worktrees/<id> -b <id> origin/HEAD");
    expect(text).toContain("record the invoking primary checkout as the fallback");
  });

  test("linked-worktree detection uses git metadata, not path spelling", () => {
    const text = squash(read(TEAM_WORKTREE));
    expect(text).toContain("scripts/inspect-repo.mjs");
    expect(text).not.toContain("path contains");
  });
});
