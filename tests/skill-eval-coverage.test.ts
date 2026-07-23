// tests/skill-eval-coverage.test.ts
//
// Coverage-audit meta-test (TESTING.md §6 — every component must have a test
// of the right kind). Encodes the structure.md triage as the immutable scope
// fence. Free, deterministic, no model calls.
//
// L5 skills (self-contained or light-prior-state — 9 total):
//   git-commit, changelog, team-question, eng-design-doc-review, team-fix,
//   team-research, team-design, team-structure, team-plan
//
// L2-demoted skills (heavy-prior-state — 4 total):
//   team, team-worktree, team-pr, team-implement
//
// Each L5 skill must have all four artifacts:
//   1. evals/fixtures/<skill>/  with at least one case dir containing
//      input.md + ground-truth.json
//   2. evals/rubrics/<skill>.md
//   3. tests/<skill>.evals.ts
//   4. skill name appears as a key in both E2E_TOUCHFILES and E2E_TIERS
//      in tests/helpers/touchfiles.ts
//
// Each demoted skill must have:
//   1. NO evals/fixtures/<skill>/ directory (demotion enforced, not accidental)
//   2. NO tests/<skill>.evals.ts
//   3. A sentinel comment in tests/protocol.test.ts documenting the demotion
//      (line matching: // L2-demoted (heavy prior state): followed by the skill)

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";
import { E2E_TOUCHFILES, E2E_TIERS } from "./helpers/touchfiles";

const REPO_ROOT = process.cwd();
const FIXTURE_ROOT = join(REPO_ROOT, "evals", "fixtures");
const RUBRIC_ROOT = join(REPO_ROOT, "evals", "rubrics");
const TESTS_ROOT = join(REPO_ROOT, "tests");

// The nine L5-eligible skills from structure.md triage.
const L5_SKILLS = [
  "git-commit",
  "changelog",
  "team-question",
  "eng-design-doc-review",
  "team-fix",
  "team-research",
  "team-design",
  "team-structure",
  "team-plan",
] as const;

// The four skills demoted to L2 (heavy prior state).
const L2_DEMOTED_SKILLS = [
  "team",
  "team-worktree",
  "team-pr",
  "team-implement",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fixtureDir(skill: string): string {
  return join(FIXTURE_ROOT, skill);
}

function rubricPath(skill: string): string {
  return join(RUBRIC_ROOT, `${skill}.md`);
}

function evalsFilePath(skill: string): string {
  return join(TESTS_ROOT, `${skill}.evals.ts`);
}

/** Returns true when the fixture dir exists AND contains at least one
 *  case sub-directory with both input.md and ground-truth.json. */
function fixtureHasAtLeastOneCase(skill: string): boolean {
  const dir = fixtureDir(skill);
  if (!existsSync(dir)) return false;
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.some((e) => {
    if (!e.isDirectory()) return false;
    const caseDir = join(dir, e.name);
    return (
      existsSync(join(caseDir, "input.md")) &&
      existsSync(join(caseDir, "ground-truth.json"))
    );
  });
}

// ---------------------------------------------------------------------------
// L5 skills: all four artifacts must exist
// ---------------------------------------------------------------------------

describe("L5 skill coverage: git-commit", () => {
  test("git-commit skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("git-commit")).toBe(true);
  });

  test("git-commit skill has a rubric file", () => {
    expect(existsSync(rubricPath("git-commit"))).toBe(true);
  });

  test("git-commit skill has an evals file", () => {
    expect(existsSync(evalsFilePath("git-commit"))).toBe(true);
  });

  test("git-commit skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("git-commit"));
    expect(registered).toBe(true);
  });

  test("git-commit skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("git-commit"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: changelog", () => {
  test("changelog skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("changelog")).toBe(true);
  });

  test("changelog skill has a rubric file", () => {
    expect(existsSync(rubricPath("changelog"))).toBe(true);
  });

  test("changelog skill has an evals file", () => {
    expect(existsSync(evalsFilePath("changelog"))).toBe(true);
  });

  test("changelog skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("changelog"));
    expect(registered).toBe(true);
  });

  test("changelog skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("changelog"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: team-question", () => {
  test("team-question skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("team-question")).toBe(true);
  });

  test("team-question skill has a rubric file", () => {
    expect(existsSync(rubricPath("team-question"))).toBe(true);
  });

  test("team-question skill has an evals file", () => {
    expect(existsSync(evalsFilePath("team-question"))).toBe(true);
  });

  test("team-question skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("team-question"));
    expect(registered).toBe(true);
  });

  test("team-question skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("team-question"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: eng-design-doc-review", () => {
  test("eng-design-doc-review skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("eng-design-doc-review")).toBe(true);
  });

  test("eng-design-doc-review skill has a rubric file", () => {
    expect(existsSync(rubricPath("eng-design-doc-review"))).toBe(true);
  });

  test("eng-design-doc-review skill has an evals file", () => {
    expect(existsSync(evalsFilePath("eng-design-doc-review"))).toBe(true);
  });

  test("eng-design-doc-review skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("eng-design-doc-review"));
    expect(registered).toBe(true);
  });

  test("eng-design-doc-review skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("eng-design-doc-review"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: team-fix", () => {
  test("team-fix skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("team-fix")).toBe(true);
  });

  test("team-fix skill has a rubric file", () => {
    expect(existsSync(rubricPath("team-fix"))).toBe(true);
  });

  test("team-fix skill has an evals file", () => {
    expect(existsSync(evalsFilePath("team-fix"))).toBe(true);
  });

  test("team-fix skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("team-fix"));
    expect(registered).toBe(true);
  });

  test("team-fix skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("team-fix"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: team-research", () => {
  test("team-research skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("team-research")).toBe(true);
  });

  test("team-research skill has a rubric file", () => {
    expect(existsSync(rubricPath("team-research"))).toBe(true);
  });

  test("team-research skill has an evals file", () => {
    expect(existsSync(evalsFilePath("team-research"))).toBe(true);
  });

  test("team-research skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("team-research"));
    expect(registered).toBe(true);
  });

  test("team-research skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("team-research"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: team-design", () => {
  test("team-design skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("team-design")).toBe(true);
  });

  test("team-design skill has a rubric file", () => {
    expect(existsSync(rubricPath("team-design"))).toBe(true);
  });

  test("team-design skill has an evals file", () => {
    expect(existsSync(evalsFilePath("team-design"))).toBe(true);
  });

  test("team-design skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("team-design"));
    expect(registered).toBe(true);
  });

  test("team-design skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("team-design"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: team-structure", () => {
  test("team-structure skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("team-structure")).toBe(true);
  });

  test("team-structure skill has a rubric file", () => {
    expect(existsSync(rubricPath("team-structure"))).toBe(true);
  });

  test("team-structure skill has an evals file", () => {
    expect(existsSync(evalsFilePath("team-structure"))).toBe(true);
  });

  test("team-structure skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("team-structure"));
    expect(registered).toBe(true);
  });

  test("team-structure skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("team-structure"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

describe("L5 skill coverage: team-plan", () => {
  test("team-plan skill has a registered L5 eval fixture", () => {
    expect(fixtureHasAtLeastOneCase("team-plan")).toBe(true);
  });

  test("team-plan skill has a rubric file", () => {
    expect(existsSync(rubricPath("team-plan"))).toBe(true);
  });

  test("team-plan skill has an evals file", () => {
    expect(existsSync(evalsFilePath("team-plan"))).toBe(true);
  });

  test("team-plan skill is registered in E2E_TOUCHFILES", () => {
    const keys = Object.keys(E2E_TOUCHFILES);
    const registered = keys.some((k) => k.startsWith("team-plan"));
    expect(registered).toBe(true);
  });

  test("team-plan skill touchfile key has a matching E2E_TIERS entry", () => {
    const keys = Object.keys(E2E_TOUCHFILES).filter((k) =>
      k.startsWith("team-plan"),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(["gate", "periodic"]).toContain(E2E_TIERS[key] ?? "");
    }
  });
});

// ---------------------------------------------------------------------------
// L5 diff-selectability: each skill's glob selects at least one touchfile key
// ---------------------------------------------------------------------------

describe("L5 diff-selectability", () => {
  for (const skill of L5_SKILLS) {
    test(`${skill} touchfile entry globs match skills/${skill}/** path`, () => {
      // At least one E2E_TOUCHFILES entry must reference skills/<skill>/
      const allGlobs = Object.values(E2E_TOUCHFILES).flat();
      const skillGlob = `skills/${skill}/`;
      const matched = allGlobs.some((g) => g.startsWith(skillGlob) || g === `skills/${skill}/**`);
      expect(matched).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// L2-demoted skills: no fixture dir, no evals file, demotion marker present
// ---------------------------------------------------------------------------

describe("L2 demotion: team", () => {
  test("team has no evals/fixtures/team/ directory (demotion enforced)", () => {
    expect(existsSync(fixtureDir("team"))).toBe(false);
  });

  test("team has no tests/team.evals.ts file (demotion enforced)", () => {
    expect(existsSync(evalsFilePath("team"))).toBe(false);
  });

  test("protocol.test.ts documents team as L2-demoted (heavy prior state)", () => {
    const text = read(join(TESTS_ROOT, "protocol.test.ts"));
    // The implementer must add a comment line:
    // // L2-demoted (heavy prior state): team, team-worktree, team-pr, team-implement
    expect(/\/\/ L2-demoted \(heavy prior state\):[^\n]*\bteam\b/.test(text)).toBe(true);
  });
});

describe("L2 demotion: team-worktree", () => {
  test("team-worktree has no evals/fixtures/team-worktree/ directory (demotion enforced)", () => {
    expect(existsSync(fixtureDir("team-worktree"))).toBe(false);
  });

  test("team-worktree has no tests/team-worktree.evals.ts file (demotion enforced)", () => {
    expect(existsSync(evalsFilePath("team-worktree"))).toBe(false);
  });

  test("protocol.test.ts documents team-worktree as L2-demoted (heavy prior state)", () => {
    const text = read(join(TESTS_ROOT, "protocol.test.ts"));
    expect(/\/\/ L2-demoted \(heavy prior state\):[^\n]*\bteam-worktree\b/.test(text)).toBe(true);
  });
});

describe("L2 demotion: team-pr", () => {
  test("team-pr has no evals/fixtures/team-pr/ directory (demotion enforced)", () => {
    expect(existsSync(fixtureDir("team-pr"))).toBe(false);
  });

  test("team-pr has no tests/team-pr.evals.ts file (demotion enforced)", () => {
    expect(existsSync(evalsFilePath("team-pr"))).toBe(false);
  });

  test("protocol.test.ts documents team-pr as L2-demoted (heavy prior state)", () => {
    const text = read(join(TESTS_ROOT, "protocol.test.ts"));
    expect(/\/\/ L2-demoted \(heavy prior state\):[^\n]*\bteam-pr\b/.test(text)).toBe(true);
  });
});

describe("L2 demotion: team-implement", () => {
  test("team-implement has no evals/fixtures/team-implement/ directory (demotion enforced)", () => {
    expect(existsSync(fixtureDir("team-implement"))).toBe(false);
  });

  test("team-implement has no tests/team-implement.evals.ts file (demotion enforced)", () => {
    expect(existsSync(evalsFilePath("team-implement"))).toBe(false);
  });

  test("protocol.test.ts documents team-implement as L2-demoted (heavy prior state)", () => {
    const text = read(join(TESTS_ROOT, "protocol.test.ts"));
    expect(/\/\/ L2-demoted \(heavy prior state\):[^\n]*\bteam-implement\b/.test(text)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Executable utility skill covered at L2 (not L5). `shipit` lands a reviewed
// PR — heavy external state (an open PR, CI, the GitHub API) that cannot be
// honestly driven in a single offline `claude -p` eval, the same reason
// `team-pr` is demoted. Its behavioral contract is pinned by its dedicated
// L2 tripwire, tests/shipit-skill.test.ts, not an L5 eval.
// ---------------------------------------------------------------------------

describe("L2 coverage: shipit (executable utility, not L5)", () => {
  test("shipit has no evals/fixtures/shipit/ directory (no L5 eval)", () => {
    expect(existsSync(fixtureDir("shipit"))).toBe(false);
  });

  test("shipit has no tests/shipit.evals.ts file (no L5 eval)", () => {
    expect(existsSync(evalsFilePath("shipit"))).toBe(false);
  });

  test("shipit is pinned by its dedicated L2 tripwire tests/shipit-skill.test.ts", () => {
    expect(existsSync(join(TESTS_ROOT, "shipit-skill.test.ts"))).toBe(true);
  });
});
