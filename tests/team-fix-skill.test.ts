import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const ROOT = process.cwd();
const SKILL = join(ROOT, "skills", "team-fix", "SKILL.md");
const body = () => (existsSync(SKILL) ? read(SKILL) : "");
const metadata = () => (existsSync(SKILL) ? frontmatter(read(SKILL)) : "");

describe("team-fix contract", () => {
  test("keeps its public routing and mutation warning", () => {
    const fm = metadata().replace(/\s+/g, " ");
    expect(fm).toMatch(/name:\s*team-fix/);
    expect(fm).toMatch(/effort:\s*high/);
    expect(fm).toContain('argument-hint: "<ticket id, issue URL, or bug description>"');
    for (const trigger of [
      "run the bug-fix pipeline",
      "team-fix this bug",
      "/team-fix",
    ]) {
      expect(fm).toContain(trigger);
    }
    expect(fm).toContain("mutates git, GitHub, and tracker state");
  });

  test("keeps the compressed phase order and progress ledger", () => {
    const text = body();
    const phases = ["WORKTREE", "REPRODUCE", "RED", "GREEN", "VERIFY", "SHIP"];
    let previous = -1;
    for (const phase of phases) {
      const index = text.indexOf(phase);
      expect(index).toBeGreaterThan(previous);
      previous = index;
    }
    expect(text).toContain(
      "Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship",
    );
  });

  test("keeps branch isolation, test-first commits, and scope stop", () => {
    const text = body();
    expect(text).toContain("../team-worktree/scripts/inspect-repo.mjs");
    expect(text).toContain("onDefaultBranch");
    expect(loadsSkill(text, "team-worktree")).toBe(true);
    expect(loadsSkill(text, "worktree-isolation")).toBe(true);
    expect(text).toContain("git switch -c <id>");
    expect(text).toContain("signed `test:` commit");
    expect(text).toContain("signed `fix:` commit");
    expect(text).toContain("recommend `/team`");
  });

  test("keeps explicit push and draft-PR termination", () => {
    const text = body();
    expect(text).toContain("git push -u origin <branch>");
    expect(text).toContain("gh pr create --draft --body-file <body-file>");
    expect(text).toContain("Never close it manually");
    expect(text).not.toContain("commit to the working branch");
  });
});
