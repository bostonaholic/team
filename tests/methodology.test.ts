import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";

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
    // Key on the table-row delimiter so prose mentions of the skill name
    // elsewhere in the doc cannot crowd the row out of the 5-line window.
    const row = filterRows(read(SKILLS_MD), "| `code-review` |", /^#|^>|SKILL\.md|\/\/|event/);
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
      "description: Use as the first agent of the QRSPI pipeline. Decomposes a user's task description into a full task record (task.md) and neutral research questions (questions.md), plus conditional artifacts — a prd.md when the PRD criteria apply, and a repos.md listing the repos the topic touches when the description names more than one repository. The researcher who reads questions.md should have no idea what feature is being built.";
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

  test("design-author description frontmatter matches the self-answering wording", () => {
    // The open-questions-for-the-user and
    // MUST-present-interactively clauses are gone — the design author
    // resolves its own open questions and records each as an assumption.
    const expected =
      "description: Use after research is complete to draft the approach before any code is written. Drafts a ~200-line design document covering current state, desired end state, patterns to follow, and decisions made. Resolves its own open questions autonomously, recording each as an explicit, auditable assumption in the design.";
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

  test("structure-planner description frontmatter matches the design-review wording", () => {
    // The design is gated by an adversarial
    // design review, not human approval.
    const expected =
      "description: Use after the design review passes to break the work into vertical slices with verification checkpoints. Each slice is end-to-end (touches every layer needed to deliver one piece of functionality), independently testable, and atomically committable. Produces a ~2-page document that the planner and implementer consume; it advances autonomously to PLAN with no approval gate.";
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
// systems-thinking lens — free L2 content tripwires (docs/testing.md §2).
// The 49th methodology skill carries the system-fit reasoning lens once;
// eight judgment surfaces cite it. Four cited heading names collide with
// existing skills (## When Designing / ## When Slicing in product-thinking,
// ## When Implementing / ## When Reviewing in engineering-standards), so
// bare heading resolution would pass a broken citation. Every citation
// tripwire thus asserts PATH-adjacency: the grepA4 window around each
// `systems-thinking` mention must carry BOTH the skill file path
// skills/systems-thinking/SKILL.md AND the cited ## When ... heading, and
// the heading must resolve in the skill itself.
// ---------------------------------------------------------------------------

describe("systems-thinking lens (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "systems-thinking", "SKILL.md");
  const SKILL_PATH = "skills/systems-thinking/SKILL.md";

  // Missing-file reads return "" so pre-implementation checks fail as
  // assertions (expected "" to contain ...), never as ENOENT crashes
  // (pattern: tests/thin-agents.test.ts readOrEmpty).
  function readOrEmpty(path: string): string {
    return existsSync(path) ? read(path) : "";
  }

  // The path-adjacency window: every line mentioning systems-thinking in an
  // agent body (frontmatter stripped — the skills: preload line must not
  // satisfy a body-citation check) plus the next 4 lines.
  function citationWindow(agentFile: string): string {
    return grepA4(body(readOrEmpty(agentFile)), /systems-thinking/);
  }

  describe("slice 1: the lens exists and reviewers enforce System Fit", () => {
    const CODE_REVIEW_SKILL = join(REPO_ROOT, "skills", "code-review", "SKILL.md");
    const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");
    const UX_REVIEWER = join(REPO_ROOT, "agents", "ux-reviewer.md");

    test("systems-thinking skeleton carries the four lenses, the six When sections, and Lens Not Dogma", () => {
      const text = readOrEmpty(SKILL_FILE);
      expect(text.length).toBeGreaterThan(0);
      // The eight H2 headings, verbatim and in order — the only H2s.
      const expectedH2 = [
        "## Core Lenses",
        "## When Researching",
        "## When Designing",
        "## When Slicing",
        "## When Planning",
        "## When Implementing",
        "## When Reviewing",
        "## Lens, Not Dogma",
      ].join("\n");
      const actualH2 = (text.match(/^## .*$/gm) ?? []).join("\n");
      expect(actualH2).toBe(expectedH2);
      // The four named lenses, bold.
      expect(text).toContain("**Blast radius over diff radius**");
      expect(text).toContain("**Callers and siblings first**");
      expect(text).toContain("**Conventions are contracts**");
      expect(text).toContain("**Leave the system consistent**");
      // Greenfield/single-file edge case: "none found" is a complete
      // answer; manufactured findings are forbidden.
      const closer = sectionFrom(text, "## Lens, Not Dogma");
      expect(closer.length).toBeGreaterThan(0);
      expect(/none found/i.test(closer)).toBe(true);
      expect(/complete answer/i.test(closer)).toBe(true);
    });

    test("code-review step 4 carries the System fit item", () => {
      // The bold checklist item asks the three system-fit questions:
      // sibling divergence, callers/consumers outside the diff, and the
      // conventions established elsewhere.
      const window = grepA4(read(CODE_REVIEW_SKILL), /\*\*System fit\*\*/);
      expect(window.length).toBeGreaterThan(0);
      expect(/sibling/i.test(window)).toBe(true);
      expect(/caller|consumer/i.test(window)).toBe(true);
      expect(/convention/i.test(window)).toBe(true);
    });

    test("code-reviewer and ux-reviewer directives name the systems-thinking skill file adjacent to their ## When Reviewing cite", () => {
      const codeReviewerWindow = citationWindow(CODE_REVIEWER);
      expect(codeReviewerWindow).toContain(SKILL_PATH);
      expect(codeReviewerWindow).toContain("## When Reviewing");
      // code-reviewer's bullet cites the checklist item by name.
      expect(codeReviewerWindow).toContain("System Fit");
      const uxReviewerWindow = citationWindow(UX_REVIEWER);
      expect(uxReviewerWindow).toContain(SKILL_PATH);
      expect(uxReviewerWindow).toContain("## When Reviewing");
      // The cited heading resolves in the skill itself.
      expect(readOrEmpty(SKILL_FILE)).toContain("## When Reviewing");
    });
  });

  describe("slice 2: designs name their blast radius and the gate audits it", () => {
    const AUTHORING_DESIGNS = join(REPO_ROOT, "skills", "authoring-designs", "SKILL.md");
    const ENG_DESIGN_REVIEW = join(REPO_ROOT, "skills", "eng-design-doc-review", "SKILL.md");

    test("authoring-designs rules bullet names skills/systems-thinking/SKILL.md adjacent to its ## When Designing cite", () => {
      // design-author.md:80 already cites product-thinking's same-named
      // ## When Designing — the skill-file path is what disambiguates.
      const window = grepA4(read(AUTHORING_DESIGNS), /systems-thinking/);
      expect(window).toContain(SKILL_PATH);
      expect(window).toContain("## When Designing");
      expect(readOrEmpty(SKILL_FILE)).toContain("## When Designing");
    });

    test("authoring-designs template requires adjacent components in Current state and co-changing surfaces in Decisions made", () => {
      const text = read(AUTHORING_DESIGNS);
      expect(/adjacent components/i.test(text)).toBe(true);
      expect(/change together/i.test(text)).toBe(true);
    });

    test("eng-design-doc-review step 3 carries the blast-radius question", () => {
      const step3 = sliceBetween(
        read(ENG_DESIGN_REVIEW),
        "**Audit the decisions.**",
        "**Verify edge-case enumeration.**",
      );
      expect(step3.length).toBeGreaterThan(0);
      expect(/blast radius/i.test(step3)).toBe(true);
    });
  });

  describe("slice 3: implementer execution discipline", () => {
    const IMPLEMENTER = join(REPO_ROOT, "agents", "implementer.md");

    test("implementer directive names the systems-thinking skill file adjacent to its ## When Implementing cite", () => {
      const window = citationWindow(IMPLEMENTER);
      expect(window).toContain(SKILL_PATH);
      expect(window).toContain("## When Implementing");
      expect(readOrEmpty(SKILL_FILE)).toContain("## When Implementing");
    });

    test("implementer directive requires searching for an existing implementation and updating affected callers", () => {
      const window = citationWindow(IMPLEMENTER);
      expect(/existing implementation/i.test(window)).toBe(true);
      expect(/affected caller/i.test(window)).toBe(true);
    });
  });

  describe("slice 4: upstream preloads — researcher, structure-planner, planner", () => {
    const UPSTREAM_AGENTS: { agent: string; heading: string }[] = [
      { agent: "researcher", heading: "## When Researching" },
      { agent: "structure-planner", heading: "## When Slicing" },
      { agent: "planner", heading: "## When Planning" },
    ];

    for (const { agent, heading } of UPSTREAM_AGENTS) {
      test(`${agent} frontmatter has a skills: block listing systems-thinking`, () => {
        const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
        expect(/^skills:/m.test(fm)).toBe(true);
        expect(/systems-thinking|team:systems-thinking/.test(fm)).toBe(true);
      });

      test(`${agent} directive names the systems-thinking skill file adjacent to its ${heading} cite`, () => {
        const window = citationWindow(join(REPO_ROOT, "agents", `${agent}.md`));
        expect(window).toContain(SKILL_PATH);
        expect(window).toContain(heading);
        expect(readOrEmpty(SKILL_FILE)).toContain(heading);
      });
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
  // Pinned everywhere the gate is stated, so the three copies cannot drift.
  const GATE_FILES: Array<[string, string]> = [
    ["team", join(REPO_ROOT, "skills", "team", "SKILL.md")],
    ["team-implement", join(REPO_ROOT, "skills", "team-implement", "SKILL.md")],
    ["team-fix", join(REPO_ROOT, "skills", "team-fix", "SKILL.md")],
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
// tripwires (docs/testing.md §2). The DESIGN human gate is retired: design.md
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

  test("code-review skill keeps the always-blocking flaky-test severity rule keyed to outcome-dependence", () => {
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

  test("the flaky red-flag catalog lives in test-style only, not duplicated in code-review", () => {
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
    // ...and the catalog bullets no longer live in code-review at all.
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
    expect(text).toContain("skills/code-review/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// Time-bomb example pair — free L2 content tripwire (docs/testing.md §2).
// The fenced bad/good time-bomb example used to live in two hand-maintained
// copies (code-review + test-first-development) under a byte-identity drift
// guard. The test-style extraction collapsed it to ONE copy — a single copy
// needs no drift guard, so this pin asserts single-copy residency plus the
// pointers the former hosts keep.
// ---------------------------------------------------------------------------

describe("time-bomb example pair (single copy in test-style)", () => {
  const CODE_REVIEW_SKILL = join(REPO_ROOT, "skills", "code-review", "SKILL.md");
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
// commented-out code, no TODOs, doc-comment exemption); the implementer's
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
    // Upstream-bug-link exemption: the link IS the why.
    expect(/upstream/i.test(section)).toBe(true);
    // No commented-out code; no TODOs in delivered code.
    expect(/commented-out code/i.test(section)).toBe(true);
    expect(section).toContain("TODO");
    // Doc comments on exported/public interfaces follow the ecosystem's
    // convention and are exempt.
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
    expect(directive).toContain("engineering-standards/SKILL.md");
  });
});

// ---------------------------------------------------------------------------
// Comment red flags — free L2 content tripwires (docs/testing.md §2). The
// code-review skill owns the split severity regime for comment violations:
// ticket/issue IDs and plan/slice/phase markers in comments are mechanical,
// judgment-free, and rot — blocking on FIRST occurrence (flaky-test
// precedent); what-restating, wordiness, and commented-out code follow the
// existing style-escalation regime. The code-reviewer agent mirrors the
// check and defers severity definitions to the skill; pins on both sides
// mean a one-sided edit fails CI.
// ---------------------------------------------------------------------------

describe("comment red flags (L2 content tripwire)", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "code-review", "SKILL.md");
  const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");

  test("code-review skill defines the Comment red flags split regime", () => {
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
    // Carve-outs: upstream-bug links where the link is the why, and
    // ticket-like tokens outside comment syntax (string literals).
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
  const SYSTEMS = read(join(REPO_ROOT, "skills", "systems-thinking", "SKILL.md"));

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
    expect(text).toContain("systems-thinking/SKILL.md");
  });

  test("systems-thinking defers to a written rule where one speaks", () => {
    expect(SYSTEMS.length).toBeGreaterThan(0);
    const text = squash(SYSTEMS);
    expect(/conventions established elsewhere/i.test(text)).toBe(true);
    expect(/where no written\s+rule speaks|no written rule speaks/i.test(text)).toBe(true);
  });
});

// A design with two entry modes can satisfy the six edge-case categories
// per mode in isolation while the modes disagree with each other. Nothing
// asked for the surface x safeguard matrix, so three consecutive review
// rounds each found one more asymmetry, one instance at a time.
describe("cross-surface parity is checked (L2 tripwire)", () => {
  const AUTHORING = read(join(REPO_ROOT, "skills", "authoring-designs", "SKILL.md"));
  const REVIEW = read(join(REPO_ROOT, "skills", "eng-design-doc-review", "SKILL.md"));
  const CODE_REVIEW = read(join(REPO_ROOT, "skills", "code-review", "SKILL.md"));

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

  test("code-review applies the same check to a diff", () => {
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
