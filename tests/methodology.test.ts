import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

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

// Keep lines containing `key`, drop lines matching the `exclude` regex, take
// the first 5, join. Isolates a single table row from a methodology doc.
function filterRows(text: string, key: string, exclude: RegExp): string {
  return text
    .split("\n")
    .filter((line) => line.includes(key))
    .filter((line) => !exclude.test(line))
    .slice(0, 5)
    .join("\n");
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
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
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

  test("skill contains all 9 quality checklist items", () => {
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
    ]) {
      expect(text).toContain(item);
    }
  });

  test("skill contains role-specific sections", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("When Implementing");
    expect(text).toContain("When Reviewing");
  });

  test("planner.md references engineering-standards/SKILL.md", () => {
    expect(read(PLANNER)).toContain("engineering-standards/SKILL.md");
  });

  test("implementer.md references engineering-standards/SKILL.md", () => {
    expect(read(IMPLEMENTER)).toContain("engineering-standards/SKILL.md");
  });

  test("code-reviewer.md references engineering-standards/SKILL.md", () => {
    expect(read(CODE_REVIEWER)).toContain("engineering-standards/SKILL.md");
  });

  test("skills.md methodology table includes engineering-standards row with all 3 consumers", () => {
    const row = filterRows(read(SKILLS_MD), "engineering-standards", /^#|^>|\/\/|event/);
    expect(row.length).toBeGreaterThan(0);
    for (const agent of ["planner", "implementer", "code-reviewer"]) {
      expect(row).toContain(agent);
    }
  });

  test("skills.md code-review row unchanged", () => {
    const row = filterRows(read(SKILLS_MD), "`code-review`", /^#|^>|SKILL\.md|\/\/|event/);
    for (const agent of ["code-reviewer", "security-reviewer", "ux-reviewer", "technical-writer"]) {
      expect(row).toContain(agent);
    }
  });

  test("skill defers to solid-principles for LSP/SRP", () => {
    expect(read(SKILL_FILE)).toContain("solid-principles/SKILL.md");
  });

  test("implementer.md still references solid-principles/SKILL.md", () => {
    expect(read(IMPLEMENTER)).toContain("solid-principles/SKILL.md");
  });

  test("implementer.md still references refactoring-to-patterns/SKILL.md", () => {
    expect(read(IMPLEMENTER)).toContain("refactoring-to-patterns/SKILL.md");
  });

  test("code-reviewer.md still references solid-principles/SKILL.md", () => {
    expect(read(CODE_REVIEWER)).toContain("solid-principles/SKILL.md");
  });

  test("code-reviewer.md still references code-review/SKILL.md", () => {
    expect(read(CODE_REVIEWER)).toContain("code-review/SKILL.md");
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

  test("skills.md methodology table includes solid-principles row", () => {
    const row = filterRows(read(SKILLS_MD), "solid-principles", /^#|^>|\/\/|event/);
    expect(row.length).toBeGreaterThan(0);
  });

  test("skills.md methodology table includes refactoring-to-patterns row", () => {
    const row = filterRows(read(SKILLS_MD), "refactoring-to-patterns", /^#|^>|\/\/|event/);
    expect(row.length).toBeGreaterThan(0);
  });
});

describe("product-thinking methodology", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "product-thinking", "SKILL.md");
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");
  const STRUCTURE_PLANNER = join(REPO_ROOT, "agents", "structure-planner.md");

  test("skill file exists and first line is ---", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(read(SKILL_FILE).split("\n")[0]).toBe("---");
  });

  test("frontmatter declares name: product-thinking", () => {
    const head10 = read(SKILL_FILE).split("\n").slice(0, 10).join("\n");
    expect(/^name: product-thinking$/m.test(head10)).toBe(true);
  });

  test("description names all three loaders (questioner, design-author, structure-planner)", () => {
    const descBlock = read(SKILL_FILE)
      .split("\n")
      .slice(0, 10)
      .filter((line) => /^description:/.test(line))
      .join("\n");
    for (const loader of ["questioner", "design-author", "structure-planner"]) {
      expect(descBlock).toContain(loader);
    }
  });

  test("frontmatter is exactly name + description (no argument-hint/model/tools/permissionMode)", () => {
    const fm = frontmatter(read(SKILL_FILE));
    expect(/^argument-hint:|^model:|^tools:|^permissionMode:/m.test(fm)).toBe(false);
    expect(/^name:/m.test(fm)).toBe(true);
    expect(/^description:/m.test(fm)).toBe(true);
  });

  test("the five H2 headings exist verbatim and in order", () => {
    const expectedH2 = [
      "## Core Lenses",
      "## When Framing the Task",
      "## When Designing",
      "## When Slicing",
      "## Lens, Not Dogma",
    ].join("\n");
    const actualH2 = (read(SKILL_FILE).match(/^## .*$/gm) ?? []).join("\n");
    expect(actualH2).toBe(expectedH2);
  });

  test("H1 title is # Product Thinking", () => {
    expect(/^# Product Thinking$/m.test(read(SKILL_FILE))).toBe(true);
  });

  test("all four named lenses are present", () => {
    const text = read(SKILL_FILE);
    expect(/Demand evidence/i.test(text)).toBe(true);
    expect(/Smallest thing/i.test(text)).toBe(true);
    expect(/someone specific/i.test(text)).toBe(true);
    expect(/Talk-to-users|talk to users/i.test(text)).toBe(true);
  });

  test("## When Framing the Task carries the demand-signal / smallest-version framing questions", () => {
    const text = read(SKILL_FILE);
    expect(/specifically/i.test(text)).toBe(true);
    expect(/signal/i.test(text)).toBe(true);
    expect(/smallest version/i.test(text)).toBe(true);
  });

  test("Lens, Not Dogma closer is present", () => {
    expect(/^## Lens, Not Dogma$/m.test(read(SKILL_FILE))).toBe(true);
  });

  test("pure-lens shape — no ## Overview / ## Summary heading", () => {
    expect(/^## (Overview|Summary)$/im.test(read(SKILL_FILE))).toBe(false);
  });

  test("pure-lens shape — no checklist / gate / self-check heading", () => {
    expect(/^## .*(Checklist|Gate|Self-check|Self check)/im.test(read(SKILL_FILE))).toBe(false);
  });

  test("skill is within the <= 175 line soft norm", () => {
    // Count newlines, not lines.
    const lineCount = read(SKILL_FILE).split("\n").length - 1;
    expect(lineCount).toBeLessThanOrEqual(175);
  });

  test("questioner frontmatter has a skills: block listing product-thinking", () => {
    const fm = frontmatter(read(QUESTIONER));
    expect(/^skills:/m.test(fm)).toBe(true);
    expect(/product-thinking|team:product-thinking/.test(fm)).toBe(true);
  });

  test("questioner body directive cites ## When Framing the Task", () => {
    const b = body(read(QUESTIONER));
    expect(b).toContain("## When Framing the Task");
    expect(/product-thinking|product-need lens/i.test(b)).toBe(true);
  });

  test("questioner directive restates goal isolation and scopes to task.md framing", () => {
    const directive = grepA4(body(read(QUESTIONER)), /Apply the product-need lens|product-thinking/i);
    expect(/questions\.md|never/i.test(directive)).toBe(true);
    expect(/task\.md|framing/i.test(directive)).toBe(true);
  });

  test("questioner description frontmatter is unchanged", () => {
    const expected =
      "description: Use as the first agent of the QRSPI pipeline. Decomposes a user's task description into a full task record (task.md) and neutral research questions (questions.md), and — when the description names more than one repository — a repos.md listing the repos the topic touches. The researcher who reads questions.md should have no idea what feature is being built.";
    expect(read(QUESTIONER)).toContain(expected);
  });

  test("design-author frontmatter has a skills: block listing product-thinking", () => {
    const fm = frontmatter(read(DESIGN_AUTHOR));
    expect(/^skills:/m.test(fm)).toBe(true);
    expect(/product-thinking|team:product-thinking/.test(fm)).toBe(true);
  });

  test("design-author body directive cites ## When Designing", () => {
    const b = body(read(DESIGN_AUTHOR));
    expect(b).toContain("## When Designing");
    expect(/product-thinking|product-need lens/i.test(b)).toBe(true);
  });

  test("design-author directive states it adds no gate / no extra research", () => {
    const directive = grepA4(body(read(DESIGN_AUTHOR)), /Apply the product-need lens|product-thinking/i);
    expect(/no gate|adds no gate|no extra research|requires no/i.test(directive)).toBe(true);
  });

  test("design-author description frontmatter is unchanged", () => {
    const expected =
      'description: Use after research is complete to align with the user on the approach before any code is written. Drafts a ~200-line design document covering current state, desired end state, patterns to follow, decisions made, and explicit open questions for the user. MUST present the open questions interactively before producing the design — replaces the RPI "magic words" problem with structural interaction.';
    expect(read(DESIGN_AUTHOR)).toContain(expected);
  });

  test("structure-planner frontmatter has a skills: block listing product-thinking", () => {
    const fm = frontmatter(read(STRUCTURE_PLANNER));
    expect(/^skills:/m.test(fm)).toBe(true);
    expect(/product-thinking|team:product-thinking/.test(fm)).toBe(true);
  });

  test("structure-planner body directive cites ## When Slicing", () => {
    const b = body(read(STRUCTURE_PLANNER));
    expect(b).toContain("## When Slicing");
    expect(/product-thinking|product-need lens/i.test(b)).toBe(true);
  });

  test("structure-planner directive nudges slice-1-value / smallest scope and adds no gate", () => {
    const directive = grepA4(body(read(STRUCTURE_PLANNER)), /Apply the product-need lens|product-thinking/i);
    expect(/slice 1|smallest/i.test(directive)).toBe(true);
    expect(/no new gate|no gate|adds no/i.test(directive)).toBe(true);
  });

  test("structure-planner description frontmatter is unchanged", () => {
    const expected =
      "description: Use after the design is approved to break the work into vertical slices with verification checkpoints. Each slice is end-to-end (touches every layer needed to deliver one piece of functionality), independently testable, and atomically committable. Produces a ~2-page document that the planner and implementer consume; it advances autonomously to PLAN with no human gate.";
    expect(read(STRUCTURE_PLANNER)).toContain(expected);
  });

  test("every ## When ... heading cited by the agents resolves to a real skill heading", () => {
    const skillText = read(SKILL_FILE);
    const agentTexts = [read(QUESTIONER), read(DESIGN_AUTHOR), read(STRUCTURE_PLANNER)];
    for (const heading of ["## When Framing the Task", "## When Designing", "## When Slicing"]) {
      const cited = agentTexts.some((t) => t.includes(heading));
      expect(cited).toBe(true);
      expect(skillText).toContain(heading);
    }
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

describe("documenting-decisions lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "documenting-decisions", "SKILL.md");

  test("skill file exists with name: documenting-decisions", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*documenting-decisions\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins the ADR section contract (Context / Decision / Consequences)", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Architecture Decision Record");
    expect(/^## Context$/m.test(text)).toBe(true);
    expect(/^## Decision$/m.test(text)).toBe(true);
    expect(/^## Consequences$/m.test(text)).toBe(true);
  });
});

describe("product-requirements-doc lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "product-requirements-doc", "SKILL.md");

  test("skill file exists with name: product-requirements-doc", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*product-requirements-doc\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins the PRD section contract (problem, user stories, acceptance criteria, scope)", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Problem Statement");
    expect(text).toContain("User Stories");
    expect(text).toContain("Acceptance Criteria");
    expect(text).toContain("Scope Boundaries");
  });
});

describe("technical-design-doc lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "technical-design-doc", "SKILL.md");

  test("skill file exists with name: technical-design-doc", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*technical-design-doc\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins the TDD section contract (goals/non-goals, trade-offs, edge cases, open questions)", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("Goals and Non-Goals");
    expect(text).toContain("Trade-offs Considered");
    expect(text).toContain("Edge Cases and Failure Modes");
    expect(text).toContain("Open Questions");
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
    expect(text).toContain("One idea per sentence");
    expect(text).toContain("Active Voice");
    expect(text).toContain("Plain Language");
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

describe("test-first-development lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "test-first-development", "SKILL.md");

  test("skill file exists with name: test-first-development", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*test-first-development\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("pins write-the-test-before-the-code core rule and red-state contract", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("BEFORE any implementation code");
    expect(text).toContain("Confirm Tests Fail Correctly");
  });

  test("Test Style Rules contains the four deterministic-input subsections", () => {
    const text = read(SKILL_FILE);
    expect(/^### Control the clock$/m.test(text)).toBe(true);
    expect(/^### Seed all randomness$/m.test(text)).toBe(true);
    expect(/^### Tests own their state — any order, any host$/m.test(text)).toBe(true);
    expect(/^### Hermetic boundaries$/m.test(text)).toBe(true);
  });

  test("test-architect audit table has a Deterministic inputs row", () => {
    const TEST_ARCHITECT = join(REPO_ROOT, "agents", "test-architect.md");
    expect(read(TEST_ARCHITECT)).toContain("| Deterministic inputs |");
  });
});

// ---------------------------------------------------------------------------
// Flaky-test red flags — free L2 content tripwires (docs/testing.md §2).
// The code-review skill carries an always-blocking checklist for tests whose
// outcome depends on a nondeterministic input (time, randomness, ordering,
// network...). Two severity regimes coexist in the skill: style flags escalate
// suggestion→issue across multiple tests; flaky red flags are blocking on
// FIRST occurrence. These tripwires pin that contract and the skill↔agent
// mirror agreement (design decision 8,
// docs/plans/2026-07-15-flaky-test-red-flags/design.md).
// ---------------------------------------------------------------------------

describe("code-review flaky-test red flags (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "code-review", "SKILL.md");
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

  test("code-review skill contains the always-blocking flaky-test red-flag checklist keyed to outcome-dependence", () => {
    const text = read(SKILL_FILE);
    expect(text).toContain("**Flaky-test red flags (always blocking).**");
    // Scope severity assertions to the checklist region so the `issue
    // (blocking)` occurrences in Comment Types / the severity-tier table
    // cannot satisfy them.
    const flaky = between(text, "Flaky-test red flags", "### UX Reviewer");
    expect(flaky.length).toBeGreaterThan(0);
    expect(flaky).toContain("issue (blocking)");
    // First-occurrence wording; tolerate bold (`**first** occurrence`).
    expect(/first\*{0,2} occurrence/i.test(flaky)).toBe(true);
    // Severity rule keyed to outcome-dependence — pin the phrase, not just
    // the heading (design decision 2).
    expect(/outcome depends on/i.test(flaky)).toBe(true);
  });

  test("sleep()-for-synchronization is relocated, not duplicated", () => {
    const text = read(SKILL_FILE);
    const styleFlags = between(text, "Test-quality flags.", "Flaky-test red flags");
    const flaky = between(text, "Flaky-test red flags", "### UX Reviewer");
    // Guard both slices non-empty so the absence assertion below can't pass
    // vacuously against an empty string.
    expect(styleFlags.length).toBeGreaterThan(0);
    expect(flaky.length).toBeGreaterThan(0);
    // Relocated out of the six-flag style list (design decision 3)...
    expect(styleFlags).not.toContain("sleep()");
    // ...into the always-blocking flaky list.
    expect(flaky).toContain("sleep()");
  });

  test("code-reviewer agent mirrors the first-occurrence always-blocking rule", () => {
    // The abbreviated mirror must state both severity regimes and defer the
    // checklist body to the skill. It must do so WITHOUT the decorated
    // `issue (blocking)` literal (forbidden in the agent by
    // tests/architecture.test.ts), so this pins plain wording only.
    const bullet = between(read(CODE_REVIEWER), "**Test files**", "5. **Run tests");
    expect(bullet.length).toBeGreaterThan(0);
    expect(/first\*{0,2} occurrence/i.test(bullet)).toBe(true);
    expect(/blocking/i.test(bullet)).toBe(true);
    expect(bullet).toContain("skills/code-review/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// Time-bomb example pair — free L2 drift tripwire (docs/testing.md §2,
// collision/drift form). The fenced bad/good time-bomb example lives in two
// skills (code-review carries a copy of test-first-development's canonical
// pair, design decision 5). The copies are maintained by hand; this pin fails
// the build the moment they drift.
// ---------------------------------------------------------------------------

describe("time-bomb example pair (L2 drift tripwire)", () => {
  const CODE_REVIEW_SKILL = join(REPO_ROOT, "skills", "code-review", "SKILL.md");
  const TFD_SKILL = join(REPO_ROOT, "skills", "test-first-development", "SKILL.md");

  // All ```js fences belonging to the time-bomb example: the bad block
  // carries the future-expiry literal, the good block the issueToken call.
  function timeBombFences(text: string): string[] {
    const fences = text.match(/```js\n[\s\S]*?```/g) ?? [];
    return fences.filter(
      (fence) => fence.includes('expiresAt: "2030-01-01"') || fence.includes("issueToken"),
    );
  }

  test("fenced bad/good pair is byte-identical across the two skills", () => {
    const codeReviewPair = timeBombFences(read(CODE_REVIEW_SKILL));
    const tfdPair = timeBombFences(read(TFD_SKILL));
    // Fail-loud: extraction must find exactly the bad + good fence in each
    // file — an empty or partial slice must never pass vacuously.
    expect(codeReviewPair.length).toBe(2);
    expect(tfdPair.length).toBe(2);
    expect(codeReviewPair).toEqual(tfdPair);
  });
});
