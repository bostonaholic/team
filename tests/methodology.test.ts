import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();

// Body slice: lines after the second `---`.
function body(text: string): string {
  const lines = text.split("\n");
  let f = false;
  let b = false;
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (i === 0 && line === "---") {
      f = true;
      continue;
    }
    if (f && line === "---") {
      f = false;
      b = true;
      continue;
    }
    if (b) out.push(line);
  }
  return out.join("\n");
}

// Text between two markers; "" when either marker is missing. Callers guard
// the slice as non-empty so a missing section fails loud, never vacuously
// (pattern: tests/protocol.test.ts softSection guard).
function sliceBetween(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start === -1) return "";
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (end === -1) return "";
  return text.slice(start, end);
}

// Text from `heading` to the next heading line (`## ` or deeper); "" when the
// heading is missing, so dependent assertions fail loud, never vacuously.
function sectionFrom(text: string, heading: string): string {
  const start = text.indexOf(heading);
  if (start === -1) return "";
  const afterHeading = start + heading.length;
  const next = text.slice(afterHeading).search(/\n##/);
  if (next === -1) return text.slice(start);
  return text.slice(start, afterHeading + next);
}

// Find each line matching the pattern and emit it plus the next 4 lines,
// concatenating each window. Scopes a directive assertion to the directive
// block rather than the whole body.
function grepA4(text: string, pattern: RegExp): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (pattern.test(line)) {
      out.push(...lines.slice(i, i + 5));
    }
  }
  return out.join("\n");
}

describe("engineering-standards methodology", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "engineering-standards", "SKILL.md");
  const PLANNER = join(REPO_ROOT, "agents", "planner.md");
  const IMPLEMENTER = join(REPO_ROOT, "agents", "implementer.md");
  const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");

  test("skill file exists with valid frontmatter", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    const head10 = read(SKILL_FILE).split("\n").slice(0, 10).join("\n");
    expect(head10).toContain("name: engineering-standards");
  });

  test("skill contains all 6 philosopher names", () => {
    const text = read(SKILL_FILE);
    for (const name of ["Hickey", "Carmack", "Armstrong", "Knuth", "Liskov", "Ousterhout"]) {
      expect(text).toContain(name);
    }
  });

  test("pins every quality checklist item name, count-free role sections", () => {
    const text = read(SKILL_FILE);
    for (const item of [
      "Single Responsibility",
      "Clear Naming",
      "No Magic Numbers",
      "Explicit Error Handling",
      "Low Coupling",
      "Testability",
      "Readability",
      "DRY",
      "Performance Awareness",
      "Functional Core, Imperative Shell",
      "No Primitive Obsession",
      "Failures are actionable",
      "Comment Discipline",
    ]) {
      expect(text).toContain(item);
    }
    // The role sections ("When Implementing" / "When Reviewing") must stay
    // count-free: a hard-coded item count drifts every time the checklist
    // grows, so the stale "9 items" wording must be gone and never return.
    expect(/\b9 items\b/.test(text)).toBe(false);
  });

  test("skill contains role-specific sections", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("When Implementing");
    expect(text).toContain("When Reviewing");
  });

  test("planner.md loads engineering-standards", () => {
    expect(loadsSkill(read(PLANNER), "engineering-standards")).toBe(true);
  });

  test("implementer.md loads engineering-standards", () => {
    expect(loadsSkill(read(IMPLEMENTER), "engineering-standards")).toBe(true);
  });

  test("code-reviewer.md loads engineering-standards", () => {
    expect(loadsSkill(read(CODE_REVIEWER), "engineering-standards")).toBe(true);
  });

  test("skill defers to solid for LSP/SRP", () => {
    expect(read(SKILL_FILE)).toContain("solid/SKILL.md");
  });

  test("implementer.md still loads solid", () => {
    expect(loadsSkill(read(IMPLEMENTER), "solid")).toBe(true);
  });

  test("implementer.md still loads refactoring-to-patterns", () => {
    expect(loadsSkill(read(IMPLEMENTER), "refactoring-to-patterns")).toBe(true);
  });

  test("code-reviewer.md still loads solid", () => {
    expect(loadsSkill(read(CODE_REVIEWER), "solid")).toBe(true);
  });

  test("code-reviewer.md still references reviewing-code/SKILL.md", () => {
    expect(read(CODE_REVIEWER)).toContain("reviewing-code/SKILL.md");
  });

  test("skill contains design-first workflow with all 5 steps", () => {
    const text = read(SKILL_FILE);
    expect(/Design.First|Design-First/i.test(text)).toBe(true);
    expect(/understand|requirements/i.test(text)).toBe(true);
    expect(/incrementally|incremental/i.test(text)).toBe(true);
    expect(/self-review|quality checklist/i.test(text)).toBe(true);
    expect(/explain decisions|trade-offs/i.test(text)).toBe(true);
  });

  // The working-tree `git diff` cleanliness check is a CI-hygiene concern, not
  // a property of the code under test, so it is intentionally not covered here.

});

describe("product-need lens (L2 content tripwire)", () => {
  const QUESTION = join(REPO_ROOT, "skills", "team", "playbooks", "question.md");
  const DESIGN = join(REPO_ROOT, "skills", "team", "playbooks", "design.md");
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");
  const STRUCTURE_PLANNER = join(REPO_ROOT, "agents", "structure-planner.md");

  test("question playbook carries the demand-signal / smallest-version framing lens", () => {
    const text = read(QUESTION);
    expect(text).toContain("## Product-need lens");
    expect(/specifically/i.test(text)).toBe(true);
    expect(/signal/i.test(text)).toBe(true);
    expect(/smallest version/i.test(text)).toBe(true);
    // Goal isolation: the lens sharpens 1-task.md framing only.
    expect(/2-questions\.md|never/i.test(text)).toBe(true);
  });

  test("design playbook carries the product-need lens and adds no gate", () => {
    const text = read(DESIGN);
    expect(text).toContain("## Product-need lens");
    expect(/thinnest design/i.test(text)).toBe(true);
    expect(/no gate/i.test(text)).toBe(true);
  });

  test("structure-planner applies the product-need lens at slicing without preloading it", () => {
    const b = body(read(STRUCTURE_PLANNER));
    expect(/product-need lens/i.test(b)).toBe(true);
    expect(/slice 1|smallest/i.test(b)).toBe(true);
    expect(/no new gate|no gate|adds no/i.test(b)).toBe(true);
    expect(loadsSkill(b, "product-thinking")).toBe(false);
  });

  test("questioner and design-author apply the lens from the playbook, not a preload", () => {
    for (const agent of [QUESTIONER, DESIGN_AUTHOR]) {
      const b = body(read(agent));
      expect(/product-need lens/i.test(b)).toBe(true);
      expect(loadsSkill(b, "product-thinking")).toBe(false);
    }
    for (const agent of ["questioner", "design-author", "structure-planner"]) {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      expect(/product-thinking|team:product-thinking/.test(fm)).toBe(false);
    }
  });

  test("questioner description frontmatter is unchanged", () => {
    const expected =
      "description: Use as the first agent of the QRSPI pipeline. Decomposes a user's task description into a full task record (1-task.md) and neutral research questions (2-questions.md), plus conditional artifacts — a 3-prd.md when the PRD criteria apply, and a 4-repos.md listing the repos the topic touches when the description names more than one repository. The researcher who reads 2-questions.md should have no idea what feature is being built.";
    expect(read(QUESTIONER)).toContain(expected);
  });

  test("design-author description frontmatter matches the self-answering wording", () => {
    const expected =
      "description: Use after research is complete to draft the approach before any code is written. Drafts a ~200-line design document covering current state, desired end state, patterns to follow, and decisions made. Resolves its own open questions autonomously, recording each as an explicit, auditable assumption in the design.";
    expect(read(DESIGN_AUTHOR)).toContain(expected);
  });

  test("structure-planner description frontmatter matches the design-review wording", () => {
    const expected =
      "description: Use after the design review passes to break the work into vertical slices with verification checkpoints. Each slice is end-to-end (touches every layer needed to deliver one piece of functionality), independently testable, and atomically committable. Produces a ~2-page document that the planner and implementer consume; it advances autonomously to PLAN with no approval gate.";
    expect(read(STRUCTURE_PLANNER)).toContain(expected);
  });
});

// ---------------------------------------------------------------------------
// system dependency checks — free L2 content tripwires (docs/testing.md §2).
// The co-changing-caller lens moved from systems-thinking into one shared
// reference. Research and Design apply it in their playbooks; Structure, Plan,
// Implement, and Review surfaces read the shared reference directly instead of
// preloading a skill.
// ---------------------------------------------------------------------------

describe("system dependency checks (L2 content tripwire)", () => {
  const DEPENDENCIES = join(REPO_ROOT, "skills", "team", "references", "dependencies.md");

  function readOrEmpty(path: string): string {
    return existsSync(path) ? read(path) : "";
  }

  test("the shared reference carries the four lenses, the six When sections, and Lens Not Dogma", () => {
    const text = readOrEmpty(DEPENDENCIES);
    expect(text.length).toBeGreaterThan(0);
    const expectedH2 = [
      "## Core lenses",
      "## When researching",
      "## When designing",
      "## When slicing",
      "## When planning",
      "## When implementing",
      "## When reviewing",
      "## Lens, not dogma",
    ].join("\n");
    const actualH2 = (text.match(/^## .*$/gm) ?? []).join("\n");
    expect(actualH2).toBe(expectedH2);
    expect(text).toContain("**Blast radius over diff radius**");
    expect(text).toContain("**Callers and siblings first**");
    expect(text).toContain("**Conventions are contracts**");
    expect(text).toContain("**Leave the system consistent**");
    const closer = sectionFrom(text, "## Lens, not dogma");
    expect(closer.length).toBeGreaterThan(0);
    expect(/none found/i.test(closer)).toBe(true);
    expect(/complete answer/i.test(closer)).toBe(true);
  });

  test("reviewing-code step 4 carries the System fit item", () => {
    const CODE_REVIEW_SKILL = join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md");
    const window = grepA4(read(CODE_REVIEW_SKILL), /\*\*System fit\*\*/);
    expect(window.length).toBeGreaterThan(0);
    expect(/sibling/i.test(window)).toBe(true);
    expect(/caller|consumer/i.test(window)).toBe(true);
    expect(/convention/i.test(window)).toBe(true);
  });

  test("the research and design playbooks apply the dependency checks", () => {
    const research = read(join(REPO_ROOT, "skills", "team", "playbooks", "research.md"));
    expect(research).toContain("## System dependency checks");
    expect(research).toContain("dependencies.md");
    const design = read(join(REPO_ROOT, "skills", "team", "playbooks", "design.md"));
    expect(design).toContain("## System dependency checks");
    expect(design).toContain("dependencies.md");
  });

  test("structure-planner, planner, implementer, ux-reviewer, and code-reviewer read the shared reference instead of loading systems-thinking", () => {
    for (const agent of ["structure-planner", "planner", "implementer", "ux-reviewer", "code-reviewer"]) {
      const b = body(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      expect(b).toContain("dependencies.md");
      expect(loadsSkill(b, "systems-thinking")).toBe(false);
    }
  });

  test("researcher reads the research playbook instead of preloading systems-thinking", () => {
    const fm = frontmatter(read(join(REPO_ROOT, "agents", "researcher.md")));
    expect(/systems-thinking|team:systems-thinking/.test(fm)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Zero-coverage methodology lenses — free L2 content tripwires (TESTING.md
// §2). These lenses have no L5 behavioral output and gained no L5 eval in
// Slices 1–4, so a content tripwire pins each lens's load-bearing
// instructions: a regression that strips the contract fails the build in
// milliseconds, no model call. Each block asserts the SKILL.md exists, the
// `name:` frontmatter matches, and a real load-bearing phrase is present
// (phrases verified against the source before pinning).
// ---------------------------------------------------------------------------

describe("decision-record reference (L2 content tripwire)", () => {
  const DECISIONS = join(REPO_ROOT, "skills", "team", "references", "decisions.md");

  test("the reference carries the ADR section contract and the decision method", () => {
    const text = read(DECISIONS);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("## Architecture decision records");
    expect(/^## Context$/m.test(text)).toBe(true);
    expect(/^## Decision$/m.test(text)).toBe(true);
    expect(/^## Consequences$/m.test(text)).toBe(true);
    expect(text).toContain("## Decision method");
  });
});

describe("PRD template and question playbook (L2 content tripwire)", () => {
  const PRD = join(REPO_ROOT, "skills", "team", "references", "prd-template.md");
  const QUESTION = join(REPO_ROOT, "skills", "team", "playbooks", "question.md");

  test("the PRD template carries the section contract", () => {
    const text = read(PRD);
    expect(text).toContain("Problem Statement");
    expect(text).toContain("User Stories");
    expect(text).toContain("Acceptance Criteria");
    expect(text).toContain("Scope Boundaries");
  });

  test("the question playbook states the conditional PRD criteria", () => {
    const text = read(QUESTION);
    expect(text).toContain("## Conditional PRD");
    expect(text).toContain("3-prd.md");
    expect(text).toContain("phase: prd");
  });
});

describe("design template (L2 content tripwire)", () => {
  const TEMPLATE = join(REPO_ROOT, "skills", "team", "references", "design-template.md");

  test("the design template carries the design section contract", () => {
    const text = read(TEMPLATE);
    expect(text).toContain("## Current state");
    expect(text).toContain("## Desired end state");
    expect(text).toContain("## Decisions made");
    expect(text).toContain("## Out of scope");
    expect(text).toContain("## Open questions (deferred)");
    expect(text).toContain("## Risks");
  });
});

describe("writing-prose lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "writing-prose", "SKILL.md");

  test("skill file exists with name: writing-prose", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*writing-prose\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins the prose-quality directives (one idea per sentence, active voice)", () => {
    const text = read(SKILL_FILE);
    // Pin the directives, not their heading capitalization: the active-voice
    // rule folded into the STE mechanical-rule list, so a `## Active Voice`
    // heading is no longer the shape it takes.
    expect(text).toContain("One idea per sentence");
    expect(/active voice/i.test(text)).toBe(true);
    expect(/plain language/i.test(text)).toBe(true);
  });

  // Mechanical ban rules.
  test("pins the delete-list section heading (Words and phrases to delete)", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Words and phrases to delete");
  });

  // The strict / STE-flavored mode split.
  test("pins the Two modes section heading", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Two modes");
  });

  // The document-level rule, which sits above the sentence-level rules.
  test("pins the one-busy-reader rule and its named source", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("One busy reader");
    expect(text).toContain("Writing That Works");
    expect(text).toContain("Kenneth Roman");
    expect(text).toContain("Joel Raphaelson");
    expect(text).toContain("Lead with the recommendation");
  });

  test("frontmatter description names both modes (strict and STE-flavored)", () => {
    const fm = frontmatter(read(SKILL_FILE));
    const description = fm.split("\n").find((line) => line.startsWith("description:")) ?? "";
    expect(description).toContain("strict");
    expect(description).toContain("STE-flavored");
  });

  // The pre-return self-lint checklist.
  test("pins the Self-lint section heading", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Self-lint");
  });
});

describe("systematic-debugging lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "systematic-debugging", "SKILL.md");

  test("skill file exists with name: systematic-debugging", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*systematic-debugging\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins reproduce-first / hypothesize ordering (OBSERVE before HYPOTHESIZE)", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Reproduce the failure");
    const observeIdx = text.indexOf("Phase 1: OBSERVE");
    const hypothesizeIdx = text.indexOf("Phase 2: HYPOTHESIZE");
    expect(observeIdx).toBeGreaterThan(-1);
    expect(hypothesizeIdx).toBeGreaterThan(-1);
    expect(observeIdx).toBeLessThan(hypothesizeIdx);
  });
});

describe("test-driven-bug-fix lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "test-driven-bug-fix", "SKILL.md");

  test("skill file exists with name: test-driven-bug-fix", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*test-driven-bug-fix\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins write-a-failing-test-that-reproduces-the-bug-first ordering", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Write a Failing Test");
    expect(text).toContain("Reproduces the bug");
    // Reproduce step precedes the failing-test step.
    const reproduceIdx = text.indexOf("Step 1: Reproduce");
    const failingTestIdx = text.indexOf("Step 2: Write a Failing Test");
    expect(reproduceIdx).toBeGreaterThan(-1);
    expect(failingTestIdx).toBeGreaterThan(-1);
    expect(reproduceIdx).toBeLessThan(failingTestIdx);
  });
});

describe("git-commit lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "git-commit", "SKILL.md");

  test("skill file exists with name: git-commit", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*git-commit\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins the 50/72, Conventional Commits, and atomic-commit contract", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("The 50/72 Rule");
    expect(text).toContain("Conventional Commits");
    expect(text).toContain("BREAKING CHANGE:");
    expect(text).toContain("Atomic Commits");
  });
});

describe("test-first-development lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "test-first-development", "SKILL.md");

  test("skill file exists with name: test-first-development", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*test-first-development\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins write-the-test-before-the-code core rule and red-state contract", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("BEFORE any implementation code");
    // STE substitutes the verb "confirm" with "make sure that".
    expect(text).toContain("Make Sure That Tests Fail Correctly");
  });

  // The Test Style Rules moved to their own just-in-time skill; TFD keeps a
  // pointer. The content pins follow the moved content.
  const TEST_STYLE_FILE = join(REPO_ROOT, "skills", "test-style", "SKILL.md");

  test("test-first-development points at test-style for the style rules", () => {
    expect(read(SKILL_FILE)).toContain("test-style/SKILL.md");
  });

  test("Test Style Rules (in test-style) contains the six deterministic-input subsections", () => {
    const text = read(TEST_STYLE_FILE);
    expect(/^## Control the clock$/m.test(text)).toBe(true);
    expect(/^## Seed all randomness$/m.test(text)).toBe(true);
    expect(/^## Tests own their state — any order, any host$/m.test(text)).toBe(true);
    expect(/^## Hermetic boundaries$/m.test(text)).toBe(true);
    expect(/^## Assert outcomes, not interleavings$/m.test(text)).toBe(true);
    expect(/^## Impose order before asserting it$/m.test(text)).toBe(true);
  });

  test("audit table (in test-style) has a Deterministic inputs row (moved from test-architect)", () => {
    expect(read(TEST_STYLE_FILE)).toContain("| Deterministic inputs |");
  });

  // A green suite does not imply a green type checker: many runners transpile
  // without type-checking, and test-first deliberately writes incomplete
  // stubs. Without a static check here the first actor to notice is the
  // verifier — one of the five reviewers — which costs a whole review round.
  // Pin the routed contract payloads, not their router wording.
  const GATE_FILES: Array<[string, string]> = [
    ["team", join(REPO_ROOT, "skills", "team", "references", "11-mechanical-gate-test-confirmation.md")],
    ["team-implement", join(REPO_ROOT, "skills", "team-implement", "references", "03-execution.md")],
    ["team-fix", join(REPO_ROOT, "skills", "team-fix", "references", "06-execution.md")],
  ];

  for (const [label, file] of GATE_FILES) {
    test(`${label}'s mechanical gate requires a static check, not only tests`, () => {
      const text = squash(read(file));
      // Guard: a missing file must fail, not vacuously pass the checks below.
      expect(text.length).toBeGreaterThan(0);
      expect(/mechanical gate/i.test(text)).toBe(true);
      expect(/static check/i.test(text)).toBe(true);
      expect(/typecheck/i.test(text)).toBe(true);
    });
  }

  test("test-first-development requires static checks before handoff", () => {
    const text = squash(read(SKILL_FILE));
    expect(text.length).toBeGreaterThan(0);
    expect(/static check/i.test(text)).toBe(true);
  });

  test("the test-architect report carries a static-check line", () => {
    const text = squash(read(join(REPO_ROOT, "agents", "test-architect.md")));
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Static checks pass");
  });
});

// ---------------------------------------------------------------------------
// Design-review gate replaces approval frontmatter — free L2 content
// tripwires (docs/testing.md §2). The DESIGN human gate is retired: 6-design.md
// carries only `revision` (no `approved`/`approved_at`), and the runtime
// hooks infer phase from the `design-review-<n>.md` verdict artifact instead
// of reading approval frontmatter.
// ---------------------------------------------------------------------------

describe("design-review gate replaces approval frontmatter (L2 tripwire)", () => {
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");

  test("design-author frontmatter template keeps revision and drops approved/approved_at", () => {
    const text = read(DESIGN_AUTHOR);
    // The revision counter survives — it counts review loops.
    expect(text).toContain("revision: 0");
    // No approval fields remain in the artifact template (the template's
    // frontmatter lines sit at column 0 inside the fenced block).
    expect(/^approved/m.test(text)).toBe(false);
  });

  for (const name of ["session-start-recover", "pre-compact-anchor"]) {
    test(`hooks/${name}.mjs infers from design-review-<n>.md, not approved frontmatter`, () => {
      const src = read(join(REPO_ROOT, "hooks", `${name}.mjs`));
      // Phase inference reads the design-review verdict artifact...
      expect(src).toContain("design-review-");
      // ...and no approval-frontmatter read (or comment about one) remains.
      expect(/approved/.test(src)).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Flaky-test red flags — free L2 content tripwires (docs/testing.md §2).
// The reviewing-code skill carries an always-blocking checklist for tests whose
// outcome depends on a nondeterministic input (time, randomness, ordering,
// network...). Two severity regimes coexist in the skill: style flags escalate
// suggestion→issue across multiple tests; flaky red flags are blocking on
// FIRST occurrence. These tripwires pin that contract and the skill↔agent
// mirror agreement (design decision 8,
// docs/plans/2026-07-15-flaky-test-red-flags/6-design.md).
// ---------------------------------------------------------------------------

describe("reviewing-code flaky-test red flags (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md");
  const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");

  // Text between two markers; "" when either marker is missing. Callers guard
  // the slice as non-empty so a missing section fails loud, never vacuously
  // (pattern: tests/protocol.test.ts softSection guard).
  function between(text: string, startMarker: string, endMarker: string): string {
    const start = text.indexOf(startMarker);
    if (start === -1) return "";
    const end = text.indexOf(endMarker, start);
    if (end === -1) return "";
    return text.slice(start, end);
  }

  test("reviewing-code skill keeps the always-blocking flaky-test severity rule keyed to outcome-dependence", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("**Flaky-test red flags (always blocking).**");
    // Scope severity assertions to the checklist region so the `issue
    // (blocking)` occurrences in Comment Types cannot satisfy them.
    const flaky = between(text, "Flaky-test red flags", "### UX Reviewer");
    expect(flaky.length).toBeGreaterThan(0);
    expect(flaky).toContain("issue (blocking)");
    // First-occurrence wording; tolerate bold (`**first** occurrence`).
    expect(/first\*{0,2} occurrence/i.test(flaky)).toBe(true);
    // Severity rule keyed to outcome-dependence — pin the phrase, not just
    // the heading (design decision 2).
    expect(/outcome depends on/i.test(flaky)).toBe(true);
    // The red-flag catalog itself moved to test-style; the severity rule
    // stays here with a pointer at the single catalog copy.
    expect(flaky).toContain("test-style/SKILL.md");
  });

  test("the flaky red-flag catalog lives in test-style only, not duplicated in reviewing-code", () => {
    const TEST_STYLE = join(REPO_ROOT, "skills", "test-style", "SKILL.md");
    const codeReview = read(SKILL_FILE);
    const styleFlags = between(codeReview, "Test-quality flags.", "Flaky-test red flags");
    const flaky = between(codeReview, "Flaky-test red flags", "### UX Reviewer");
    // Guard both slices non-empty so the absence assertions below cannot pass
    // vacuously against an empty string.
    expect(styleFlags.length).toBeGreaterThan(0);
    expect(flaky.length).toBeGreaterThan(0);
    // The six-flag style list never carries sleep() (design decision 3)...
    expect(styleFlags).not.toContain("sleep()");
    // ...and the catalog bullets no longer live in reviewing-code at all.
    expect(flaky).not.toContain("sleep()");
    // The single catalog copy sits in test-style's reviewer checklist.
    const testStyle = read(TEST_STYLE);
    const checklistStart = testStyle.indexOf("## Flaky-test red flags (reviewer checklist)");
    expect(checklistStart).toBeGreaterThan(-1);
    expect(testStyle.slice(checklistStart)).toContain("sleep()");
  });

  test("code-reviewer defers the first-occurrence always-blocking rule to the skill", () => {
    // The wrapper no longer mirrors the checklist body (thin-agents
    // refactor); it keeps the first-occurrence rule wording and the pointer
    // to the canonical skill. Plain wording only — the decorated
    // `issue (blocking)` literal stays forbidden in the agent by
    // tests/architecture.test.ts.
    const text = read(CODE_REVIEWER);
    expect(/first\*{0,2} occurrence/i.test(text)).toBe(true);
    expect(/blocking/i.test(text)).toBe(true);
    expect(text).toContain("skills/reviewing-code/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// Time-bomb example pair — free L2 content tripwire (docs/testing.md §2).
// The fenced bad/good time-bomb example used to live in two hand-maintained
// copies (reviewing-code + test-first-development) under a byte-identity drift
// guard. The test-style extraction collapsed it to ONE copy — a single copy
// needs no drift guard, so this pin asserts single-copy residency plus the
// pointers the former hosts keep.
// ---------------------------------------------------------------------------

describe("time-bomb example pair (single copy in test-style)", () => {
  const CODE_REVIEW_SKILL = join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md");
  const TFD_SKILL = join(REPO_ROOT, "skills", "test-first-development", "SKILL.md");
  const TEST_STYLE_SKILL = join(REPO_ROOT, "skills", "test-style", "SKILL.md");

  // All ```js fences belonging to the time-bomb example: the bad block
  // carries the future-expiry literal, the good block the issueToken call.
  function timeBombFences(text: string): string[] {
    const fences = text.match(/```js\n[\s\S]*?```/g) ?? [];
    return fences.filter(
      (fence) => fence.includes('expiresAt: "2030-01-01"') || fence.includes("issueToken"),
    );
  }

  test("exactly one bad/good pair exists, in test-style", () => {
    expect(timeBombFences(read(TEST_STYLE_SKILL)).length).toBe(2);
    expect(timeBombFences(read(CODE_REVIEW_SKILL)).length).toBe(0);
    expect(timeBombFences(read(TFD_SKILL)).length).toBe(0);
  });

  test("the former hosts point at test-style instead of carrying copies", () => {
    expect(read(CODE_REVIEW_SKILL)).toContain("test-style/SKILL.md");
    expect(read(TFD_SKILL)).toContain("test-style/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// Code-comment rules — free L2 content tripwires (docs/testing.md §2).
// engineering-standards is the single source of truth for the binding comment
// rule set (why-only, rewrite-first, no ticket/pipeline references, no
// commented-out code, no TODOs, and the in-body scope of the ban); the implementer's
// `## Code quality` block defers to it with a one-line pointer.
// ---------------------------------------------------------------------------

describe("code-comment rules (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "engineering-standards", "SKILL.md");
  const IMPLEMENTER = join(REPO_ROOT, "agents", "implementer.md");

  test("engineering-standards defines the Code Comments rule set", () => {
    const section = sectionFrom(read(SKILL_FILE), "## Code Comments");
    expect(section.length).toBeGreaterThan(0);
    // Why-only rule: comments never explain WHAT, only non-obvious WHY.
    expect(/non-obvious why/i.test(section)).toBe(true);
    // Rewrite-first: a comment that feels necessary signals a rewrite.
    expect(/rewrite/i.test(section)).toBe(true);
    // Reference ban — internal trackers and pipeline artifacts rot.
    expect(/ticket\/issue IDs/i.test(section)).toBe(true);
    expect(/plan\/slice\/phase markers/i.test(section)).toBe(true);
    expect(/doc-section references/i.test(section)).toBe(true);
    // A link that IS the why satisfies the reference ban.
    expect(/upstream/i.test(section)).toBe(true);
    // No commented-out code; no TODOs in delivered code.
    expect(/commented-out code/i.test(section)).toBe(true);
    expect(section).toContain("TODO");
    // The why-only rule covers in-body comments that restate the code; a doc
    // comment on an exported/public interface adds contract information the
    // signature does not carry, so it satisfies the rule.
    expect(/doc comments/i.test(section)).toBe(true);
    expect(/exported\/public/i.test(section)).toBe(true);
    // Scope pointer: in-source comments here; review findings belong to
    // conventional-comments. A cross-reference, so a rename fails the build.
    expect(section).toContain("skills/conventional-comments/SKILL.md");
    // Whether the expanded rule set actually changes what a reviewer flags
    // is behavior, not wording — it lives in the planted-comment-*
    // code-reviewer evals, per docs/testing.md ("behavior that only prose
    // can carry belongs at L5 or L6").
  });

  test("implementer defers comment discipline to engineering-standards via a one-line pointer", () => {
    // The wrapper no longer mirrors the rule set (thin-agents refactor);
    // it keeps a one-line pointer naming the canonical skill next to the
    // comment-discipline mention.
    const directive = grepA4(read(IMPLEMENTER), /comment discipline/i);
    expect(directive.length).toBeGreaterThan(0);
    expect(directive).toContain("`engineering-standards`");
  });
});

// ---------------------------------------------------------------------------
// Comment red flags — free L2 content tripwires (docs/testing.md §2). The
// reviewing-code skill owns the split severity regime for comment violations:
// ticket/issue IDs and plan/slice/phase markers in comments are mechanical,
// judgment-free, and rot — blocking on FIRST occurrence (flaky-test
// precedent); what-restating, wordiness, and commented-out code follow the
// existing style-escalation regime. The code-reviewer agent mirrors the
// check and defers severity definitions to the skill; pins on both sides
// mean a one-sided edit fails CI.
// ---------------------------------------------------------------------------

describe("comment red flags (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md");
  const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");

  test("reviewing-code skill defines the Comment red flags split regime", () => {
    const flags = sliceBetween(read(SKILL_FILE), "Comment red flags", "### UX Reviewer");
    expect(flags.length).toBeGreaterThan(0);
    // Mechanical references block on first occurrence; tolerate bold
    // (`**first** occurrence`).
    expect(/first\*{0,2} occurrence/i.test(flags)).toBe(true);
    expect(/blocking/i.test(flags)).toBe(true);
    expect(/ticket\/issue IDs/i.test(flags)).toBe(true);
    expect(/plan\/slice\/phase markers/i.test(squash(flags))).toBe(true);
    // TODO/FIXME is hard-banned by the canonical standard, so it must sit
    // in the blocking bucket — a demotion to style escalation fails here.
    const blockingBucket = sliceBetween(
      flags,
      "Blocking on first occurrence",
      "Style escalation",
    );
    expect(blockingBucket.length).toBeGreaterThan(0);
    expect(/TODO\/FIXME/.test(blockingBucket)).toBe(true);
    // Style regime escalates: `suggestion:` once, `issue:` when repeated.
    expect(flags).toContain("suggestion:");
    expect(flags).toContain("issue:");
    // What the flag list still admits: an upstream-bug link where the link is
    // the why, and ticket-like tokens outside comment syntax (string
    // literals).
    expect(/upstream/i.test(flags)).toBe(true);
    expect(/string literals/i.test(flags)).toBe(true);
    // Which severity bucket a judgment class lands in is behavior a model
    // has to act on, not a string in this file. The planted-comment-*
    // code-reviewer evals assert it by running the reviewer: every plant in
    // planted-comment-process-narration is style-tier, so that fixture
    // deliberately does not require a blocking label, while
    // planted-comment-violations pins the blocking label onto b1.
  });

  test("code-reviewer defers the comment-discipline check to the skill", () => {
    // The wrapper no longer mirrors the split regime (thin-agents
    // refactor); it keeps a one-line pointer that cites the checklist item
    // and names the canonical skills. The phrase-level regime assertions
    // live against the skill windows above.
    const directive = grepA4(read(CODE_REVIEWER), /Comment red flags|Comment Discipline/);
    expect(directive.length).toBeGreaterThan(0);
    // Citation contract: findings name the checklist item.
    expect(directive).toContain("Comment Discipline");
    // The pointer defers to skill-canonical definitions.
    expect(/skills\/code-review\/SKILL\.md|engineering-standards/.test(directive)).toBe(true);
  });
});

// A skeptic pass exists to kill false positives before they cost a round. It
// killed a true positive instead: the neutrality rule stripped the cited rule
// out of the claim, so the skeptic found the pattern on the default branch and
// refuted on precedent. Both halves are pinned — the claim carries its rule,
// and precedent does not outrank one.
describe("skeptic passes weigh a stated rule above precedent (L2 tripwire)", () => {
  const NESTED = read(join(REPO_ROOT, "skills", "nested-agents", "SKILL.md"));
  const DEPENDENCIES = read(join(REPO_ROOT, "skills", "team", "references", "dependencies.md"));

  test("a rule-violation claim carries the rule it cites", () => {
    // Guard: a missing file must fail, not vacuously pass the checks below.
    expect(NESTED.length).toBeGreaterThan(0);
    const text = squash(NESTED);
    expect(/rule-violation claim carries the rule/i.test(text)).toBe(true);
    // The claim template must point the skeptic at the rule's own file.
    expect(text).toContain("skills/<skill>/SKILL.md");
  });

  test("nested-agents states that a rule outranks precedent", () => {
    const text = squash(NESTED);
    expect(/stated rule outranks observed precedent/i.test(text)).toBe(true);
    expect(text).toContain("dependencies.md");
  });

  test("dependencies.md defers to a written rule where one speaks", () => {
    expect(DEPENDENCIES.length).toBeGreaterThan(0);
    const text = squash(DEPENDENCIES);
    expect(/conventions established elsewhere/i.test(text)).toBe(true);
    expect(/where no written\s+rule speaks|no written rule speaks/i.test(text)).toBe(true);
  });
});

// A design with two entry modes can satisfy the six edge-case categories
// per mode in isolation while the modes disagree with each other. Nothing
// asked for the surface x safeguard matrix, so three consecutive review
// rounds each found one more asymmetry, one instance at a time.
describe("cross-surface parity is checked (L2 tripwire)", () => {
  const AUTHORING = read(join(REPO_ROOT, "skills", "team", "references", "design-template.md"));
  const REVIEW = read(join(REPO_ROOT, "skills", "reviewing-designs", "SKILL.md"));
  const CODE_REVIEW = read(join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md"));

  test("the design template asks for a surfaces section", () => {
    // Guard: a missing file must fail, not vacuously pass the checks below.
    expect(AUTHORING.length).toBeGreaterThan(0);
    expect(AUTHORING).toContain("## Surfaces");
  });

  test("the review brief has a step for it, and a verdict trigger", () => {
    expect(REVIEW.length).toBeGreaterThan(0);
    const text = squash(REVIEW);
    expect(/reaches every surface/i.test(text)).toBe(true);
    // Without a named blocking trigger the finding rests on judgment alone.
    expect(/one surface and not\s*another/i.test(text)).toBe(true);
  });

  test("the review-process steps stay uniquely numbered after the insert", () => {
    // The new step renumbered its successors; a duplicate number is the
    // classic casualty of that edit.
    const process = REVIEW.slice(REVIEW.indexOf("### Review process"));
    const numbers = [...process.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThan(0);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  test("reviewing-code applies the same check to a diff", () => {
    expect(CODE_REVIEW.length).toBeGreaterThan(0);
    expect(/reaches every surface/i.test(squash(CODE_REVIEW))).toBe(true);
  });
});

// Slices decide what commits atomically. What ships together is a separate
// question, and the structure is the last place to ask it: a slice carrying
// the first irreversible mutation earns rounds of adversarial review, and
// anything bundled with it waits through every one of them.
describe("slicing asks whether a slice deserves its own PR (L2 tripwire)", () => {
  const SLICING = read(join(REPO_ROOT, "skills", "slicing-work", "SKILL.md"));

  test("the heuristic names the irreversible-mutation case", () => {
    // Guard: a missing file must fail, not vacuously pass the checks below.
    expect(SLICING.length).toBeGreaterThan(0);
    const text = squash(SLICING);
    expect(/its own PR/i.test(text)).toBe(true);
    expect(/irreversible/i.test(text)).toBe(true);
  });

  test("the call is recorded in the structure either way", () => {
    // A judgment left unstated is indistinguishable from one never made.
    const text = squash(SLICING);
    expect(text).toContain("## Cross-slice concerns");
  });
});

// ---------------------------------------------------------------------------
// One report shape must bind every surface a review crosses: the dispatched
// reviewer's final report, a subagent reviewing on a dispatcher's behalf, and
// the full output the top-level session presents after a direct invocation.
// Without a pinned shape, each reviewer invents its own report structure and
// the relay trims whatever it likes.
// ---------------------------------------------------------------------------
describe("code-review report format (L2 content tripwire)", () => {
  // Two files, because the report template and the direct-invocation relay
  // that binds to it now live on opposite sides of the front-door/methodology
  // split.
  const SKILL_FILE = join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md");
  const FRONT_DOOR = join(REPO_ROOT, "skills", "code-review", "SKILL.md");
  const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");
  const CROSS_MODEL = join(REPO_ROOT, "skills", "cross-model-review", "SKILL.md");

  // Every `###` heading the report carries, in the order it is emitted. The
  // list is closed and complete: a reviewer that invents a section, or drops
  // one, emits a shape no other run emits.
  const REPORT_SECTIONS = [
    "### Summary",
    "### Findings",
    "### Checks",
    "### Refuted by verification",
    "### Cross-model disposition",
  ];

  // What a section with nothing to report says instead of disappearing.
  const NO_FINDINGS_LINE = "No findings.";
  const NOTHING_REFUTED_LINE = "Nothing refuted.";
  const NOT_RUN_LINE = "Not run:";

  // "Omit the section", "omit this section", "omit that section" — the escape
  // that would let a reviewer decide the report's shape. `omit none` reads the
  // other way and must not match.
  const OMISSION_ESCAPE = /omit (?:the|this|that) section/i;

  // Text between two markers; "" when either marker is missing. Callers guard
  // the slice as non-empty so a missing section fails loud, never vacuously.
  // The module-level sectionFrom cannot slice this section: its next-heading
  // regex (\n##) also matches the ### template headings inside it.
  function between(text: string, startMarker: string, endMarker: string): string {
    const start = text.indexOf(startMarker);
    if (start === -1) return "";
    const end = text.indexOf(endMarker, start + startMarker.length);
    if (end === -1) return "";
    return text.slice(start, end);
  }

  // Same slice, but a missing end marker means "to end of file". The front
  // door is deliberately thin and `## When Invoked Directly` is its last
  // section, so there is no following `## ` to terminate on. `between` is
  // kept strict for the template slices, where a missing terminator would
  // silently pull in a later section's headings.
  function toEnd(text: string, startMarker: string, endMarker: string): string {
    const start = text.indexOf(startMarker);
    if (start === -1) return "";
    const end = text.indexOf(endMarker, start + startMarker.length);
    return end === -1 ? text.slice(start) : text.slice(start, end);
  }

  test("the skill pins one report template: verdict line first, then Summary, Findings, Checks", () => {
    // Newline-anchored start: the heading, not an inline `## Report Format`
    // cross-reference elsewhere in the skill.
    const section = between(read(SKILL_FILE), "\n## Report Format\n", "\n## ");
    // Guard: a missing section must fail, not vacuously pass the checks below.
    expect(section.length).toBeGreaterThan(0);
    // Template strings the reviewer must emit, in emission order.
    const verdict = section.indexOf("**Verdict:");
    const summary = section.indexOf("### Summary");
    const findings = section.indexOf("### Findings");
    const checks = section.indexOf("### Checks");
    expect(verdict).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(verdict);
    expect(findings).toBeGreaterThan(summary);
    expect(checks).toBeGreaterThan(findings);
    // The verdict token vocabulary stays in Verdict Criteria; the template
    // points there instead of duplicating the per-reviewer token lists.
    expect(section).toContain("Verdict Criteria");
    // The skeptic-pass record is a named conditional section of the report.
    expect(section).toContain("### Refuted by verification");
  });

  test("the template enumerates every section, in emission order, and no others", () => {
    const section = between(read(SKILL_FILE), "\n## Report Format\n", "\n## ");
    // Guard: a missing section must fail, not vacuously pass the check below.
    expect(section.length).toBeGreaterThan(0);
    // Line-anchored: the template's own headings, not the backticked
    // cross-references to them in the prose below the template.
    const headings = [...section.matchAll(/^### .+$/gm)].map((match) => match[0]);
    expect(headings).toEqual(REPORT_SECTIONS);
  });

  test("a section with nothing to report carries a placeholder instead of vanishing", () => {
    const section = between(read(SKILL_FILE), "\n## Report Format\n", "\n## ");
    // Guard: a missing section must fail, not vacuously pass the checks below.
    expect(section.length).toBeGreaterThan(0);
    // Placeholder literals the template tells the reviewer to emit. Each one
    // only exists for a section that is present, so pinning them pins that
    // every heading ships on every report.
    expect(section).toContain(NO_FINDINGS_LINE);
    expect(section).toContain(NOTHING_REFUTED_LINE);
    expect(section).toContain(NOT_RUN_LINE);
    // An omission escape reintroduces the choice the placeholders remove.
    expect(OMISSION_ESCAPE.test(section)).toBe(false);
  });

  test("the omission-escape matcher can find a positive", () => {
    // Guards the guard: the absence check above must be able to fire, so a
    // reworded template cannot turn it into a permanent no-op unnoticed.
    expect(OMISSION_ESCAPE.test("Omit the section when nothing was refuted.")).toBe(true);
    expect(OMISSION_ESCAPE.test("omit this section when the pass did not run")).toBe(true);
    expect(OMISSION_ESCAPE.test("Emit the five headings above, and omit none.")).toBe(false);
  });

  test("cross-model-review defers the disposition section's position to the report format", () => {
    const text = read(CROSS_MODEL);
    // Guard: a missing file must fail, not vacuously pass the checks below.
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("### Cross-model disposition");
    // The position is the report template's to state; this skill points at it
    // rather than describing a placement of its own.
    expect(text).toContain("skills/reviewing-code/SKILL.md");
    expect(text).toContain("Report Format");
  });

  test("the direct-invocation relay binds to the report format", () => {
    const invoked = toEnd(read(FRONT_DOOR), "\n## When Invoked Directly\n", "\n## ");
    // Guard: a missing section must fail, not vacuously pass the check below.
    expect(invoked.length).toBeGreaterThan(0);
    expect(invoked).toContain("Report Format");
  });

  test("the front door loads the format before it dispatches the reviewer", () => {
    // Ordering tripwire. The relay can only hold a shape it has read, and the
    // front door carries the template by reference, not by value. With the
    // load stated after the dispatch, a session that reads top-to-bottom
    // dispatches, relays, and never opens the template — so the shape of the
    // report becomes a per-call choice.
    const invoked = toEnd(read(FRONT_DOOR), "\n## When Invoked Directly\n", "\n## ");
    // Guard: a missing section must fail, not vacuously pass the checks below.
    expect(invoked.length).toBeGreaterThan(0);
    const format = invoked.indexOf("Report Format");
    const dispatch = invoked.indexOf("`code-reviewer`");
    expect(format).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(-1);
    expect(format).toBeLessThan(dispatch);
  });

  test("both dispatch paths are bound to the format, not just the relay", () => {
    // The front door names two reviewers: the `code-reviewer` agent, which
    // preloads the methodology, and a fallback subagent, which does not. One
    // mention of the format binds one surface. The fallback's prompt and the
    // relay are two surfaces, so the section must state the requirement on
    // each — a fallback dispatched without the template returns whatever
    // shape it invents.
    const invoked = toEnd(read(FRONT_DOOR), "\n## When Invoked Directly\n", "\n## ");
    // Guard: a missing section must fail, not vacuously pass the checks below.
    expect(invoked.length).toBeGreaterThan(0);
    // The built-in read-only agent type, named the way the sibling front door
    // `eng-design-doc-review` names it, rather than an unnamed "subagent".
    expect(invoked).toContain("Explore");
    const mentions = invoked.match(/Report Format/g) ?? [];
    expect(mentions.length).toBeGreaterThanOrEqual(2);
  });

  test("the front door defers the template instead of restating it", () => {
    // Single-source-of-truth sweep. The template lives in `reviewing-code`.
    // A copy on the front door is a second place the shape can drift, and the
    // front door is deliberately thin: it binds to the section by name (the
    // tests above) and names no heading of its own.
    const text = read(FRONT_DOOR);
    // Guard: a missing file must fail, not vacuously pass the absence checks.
    expect(text.length).toBeGreaterThan(0);
    for (const heading of REPORT_SECTIONS) {
      expect(text).not.toContain(heading);
    }
    // Guards the guard: the sweep must be able to find a positive, so a
    // reworded front door cannot turn it into a permanent no-op unnoticed.
    expect(`${text}\n${REPORT_SECTIONS[1]}\n`).toContain(REPORT_SECTIONS[1] as string);
  });

  test("code-reviewer defers its report structure to the skill's report format", () => {
    const text = read(CODE_REVIEWER);
    expect(text).toContain("Report Format");
    expect(text).toContain("skills/reviewing-code/SKILL.md");
  });
});

const SHARED_RULE_CALLERS = [
  [
    "principle-human-owns-the-ends",
    "skills/team/principles/human-control.md",
    "skills/review-severity-tiers/SKILL.md"
  ],
  [
    "principle-explicit-intent",
    "skills/team/principles/human-control.md",
    "skills/shipit/SKILL.md"
  ],
  [
    "principle-scope-fence",
    "skills/team/principles/human-control.md",
    "skills/implementing-slices/SKILL.md"
  ],
  [
    "principle-plan-present-wait",
    "skills/team/principles/human-control.md",
    "skills/groom-backlog/SKILL.md"
  ],
  [
    "principle-files-are-the-contract",
    "skills/team/principles/durable-state.md",
    "skills/team/references/artifacts.md"
  ],
  [
    "principle-idempotent-reruns",
    "skills/team/principles/durable-state.md",
    "skills/team-design/SKILL.md"
  ],
  [
    "principle-pre-image-first",
    "skills/team/principles/durable-state.md",
    "skills/pr-rebase/SKILL.md"
  ],
  [
    "principle-single-source-of-truth",
    "skills/team/principles/durable-state.md",
    "skills/qrspi-workflow/SKILL.md"
  ],
  [
    "principle-evidence-over-assertion",
    "skills/team/principles/verified-results.md",
    "skills/team/playbooks/research.md"
  ],
  [
    "principle-mechanical-gates",
    "skills/team/principles/verified-results.md",
    "skills/qrspi-workflow/SKILL.md"
  ],
  [
    "principle-fail-closed",
    "skills/team/principles/verified-results.md",
    "skills/team/SKILL.md"
  ],
  [
    "principle-skip-loudly",
    "skills/team/principles/verified-results.md",
    "skills/reviewing-code/SKILL.md"
  ],
  [
    "principle-generator-evaluator",
    "skills/team/principles/independent-review.md",
    "skills/reviewing-code/SKILL.md"
  ],
  [
    "principle-blind-the-investigator",
    "skills/team/principles/independent-review.md",
    "skills/qrspi-workflow/SKILL.md"
  ],
  [
    "principle-least-privilege",
    "skills/team/principles/independent-review.md",
    "skills/eng-design-doc-review/SKILL.md"
  ],
  [
    "principle-deep-agents-narrow-seams",
    "skills/team/principles/focused-work.md",
    "skills/nested-agents/SKILL.md"
  ],
  [
    "principle-subtract-before-you-add",
    "skills/team/principles/focused-work.md",
    "skills/engineering-standards/SKILL.md"
  ],
  [
    "principle-subtract-before-you-add",
    "skills/team/principles/focused-work.md",
    "skills/implementing-slices/SKILL.md"
  ],
  [
    "principle-subtract-before-you-add",
    "skills/team/principles/focused-work.md",
    "skills/refactoring-to-patterns/SKILL.md"
  ],
  [
    "principle-subtract-before-you-add",
    "skills/team/principles/focused-work.md",
    "skills/team/playbooks/design.md"
  ],
  [
    "principle-optimization-never-dependency",
    "skills/team/principles/focused-work.md",
    "skills/nested-agents/SKILL.md"
  ],
  [
    "principle-bounded-loops",
    "skills/team/references/execution.md",
    "skills/pr-watch-as-author/SKILL.md"
  ],
  [
    "principle-untrusted-input-is-data",
    "skills/team/references/external-data.md",
    "skills/pr-cleanup/SKILL.md"
  ],
  [
    "principle-fix-root-causes",
    "skills/team-fix/playbooks/bug-fix.md",
    "skills/systematic-debugging/SKILL.md"
  ],
  [
    "principle-record-assumptions",
    "skills/team/references/decisions.md",
    "skills/team/playbooks/design.md"
  ]
] as const;

describe("shared rule resources", () => {
  test.each(SHARED_RULE_CALLERS)("%s is ordinary content at %s consumed by %s", (retired, destination, caller) => {
    const source = read(join(REPO_ROOT, destination));
    expect(source.length).toBeGreaterThan(0);
    expect(source.startsWith("---\n")).toBe(false);
    expect(existsSync(join(REPO_ROOT, "skills", retired, "SKILL.md"))).toBe(false);
    expect(read(join(REPO_ROOT, caller))).toContain(destination.split("/").slice(2).join("/"));
  });

  test("the execution resource retains review tokens and output limits", () => {
    const source = read(join(REPO_ROOT, "skills/team/references/execution.md"));
    expect(source).toContain("DESIGN");
    expect(source).toContain("IMPLEMENT");
    expect(source).toContain("Blocking");
    expect(source).toContain("Major");
    expect(source).toContain("~200-line");
    expect(source).toContain("≤30-line");
    expect(source).not.toMatch(/(?:max(?:imum)?|cap(?:ped)?(?: at)?)\s+\d+\s+(?:review )?rounds/i);
  });

  test("shared review resources retain capability and evidence identifiers", () => {
    const source = read(join(REPO_ROOT, "skills/team/principles/independent-review.md"));
    expect(source).toContain("permissionMode: plan");
    expect(source).toContain("`Write`");
    expect(source).toContain("`Edit`");
    expect(source).toContain("`4-repos.md`");
    expect(source).toContain("`file:line`");
  });

  test("decision records retain the assumption marker", () => {
    expect(read(join(REPO_ROOT, "skills/team/references/decisions.md")))
      .toContain("Assumption — chosen without user review");
  });
});

describe("external-data rules (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "team", "references", "external-data.md");

  test("external-data resource exists without skill registration", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(existsSync(join(REPO_ROOT, "skills", "principle-never-interpolate", "SKILL.md"))).toBe(false);
  });

  test("ordinary resource has no skill frontmatter", () => {
    expect(read(SKILL_FILE).startsWith("---\n")).toBe(false);
  });

  test("pins the shell contract (byte-exact allowlist, ${VAR:?} guarded expansion)", () => {
    const text = squash(read(SKILL_FILE));
    expect(text).toContain("byte-exact");
    // Plain string, not a template literal: the literal shell guard syntax.
    expect(text).toContain("${VAR:?}");
  });

  test("citation site: groom-backlog cites the principle by name", () => {
    expect(read(join(REPO_ROOT, "skills", "groom-backlog", "SKILL.md"))).toContain("team/references/external-data.md");
  });
});

describe("the principle set is derived, not counted", () => {
  const SKILLS_MD = read(join(REPO_ROOT, "docs", "skills.md"));

  const onDisk = readdirSync(join(REPO_ROOT, "skills"))
    .filter((name) => name.startsWith("principle-"))
    .filter((name) => existsSync(join(REPO_ROOT, "skills", name, "SKILL.md")))
    .sort();

  const catalogued = [...SKILLS_MD.matchAll(/^### \[(principle-[a-z0-9-]+)\]/gm)]
    .map((match) => match[1] ?? "")
    .sort();

  // The multi-rule methodology sets. They carry no prefix on purpose: each is a
  // set of rules, not a single invariant.
  const BUNDLES = ["solid"];

  // Guard: an empty prefix set on either side would pass both directions.
  test("the principle registrations are absent on disk and in the catalog", () => {
    expect(onDisk).toEqual([]);
    expect(catalogued).toEqual([]);
  });

  // Takes both sides as arguments, so synthetic sets can prove the comparison
  // reports what it claims to catch.
  function absentFrom(names: string[], other: string[]): string[] {
    return names.filter((name) => !other.includes(name));
  }

  test("every principle- skill on disk has a catalog entry", () => {
    expect(absentFrom(onDisk, catalogued)).toEqual([]);
  });

  test("every principle- catalog entry names a skill on disk", () => {
    expect(absentFrom(catalogued, onDisk)).toEqual([]);
  });

  // Prove both directions can find a positive: an uncatalogued skill and a
  // catalog entry naming nothing on disk.
  test("the derived comparison can see planted drift in both directions", () => {
    const disk = ["principle-real", "principle-uncatalogued"];
    const catalog = ["principle-real", "principle-phantom"];
    expect(absentFrom(disk, catalog)).toEqual(["principle-uncatalogued"]);
    expect(absentFrom(catalog, disk)).toEqual(["principle-phantom"]);
  });

  test("the multi-rule bundles are catalogued and carry no principle- prefix", () => {
    const offenders: string[] = [];
    for (const bundle of BUNDLES) {
      if (!existsSync(join(REPO_ROOT, "skills", bundle, "SKILL.md"))) {
        offenders.push(`${bundle}: no skill on disk`);
      }
      if (!new RegExp(`^### \\[${bundle}\\]`, "m").test(SKILLS_MD)) {
        offenders.push(`${bundle}: no catalog entry`);
      }
      // Reachable from disk and catalog state, unlike a prefix test on the
      // literal name: a bundle renamed under the prefix lands in the derived
      // principle set above.
      if (onDisk.includes(`principle-${bundle}`) || catalogued.includes(`principle-${bundle}`)) {
        offenders.push(`${bundle}: carries the principle- prefix`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
