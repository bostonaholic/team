// tests/wiring.test.ts
//
// WIRING / CONFIG invariants — the sanctioned home for L2 tripwires that assert
// STRUCTURAL contracts (TESTING.md §2): frontmatter tool grants, agent->skill
// load links, reference targets that must exist, negative hardcode guards, the
// skill commands that ARE a skill's executable contract, and the orchestrator's
// phase-table structure. These are NOT prose pins — they check how components
// are wired together, never the instruction prose of a skill body.
//
// This file replaces the wiring half of the former methodology.test.ts and
// protocol.test.ts; their prose-phrase pins (philosopher names, lens slogans,
// required headings, topic-consistency prose) were deleted and their behavioral
// coverage moved to the consuming-agent evals (see tests/code-reviewer.evals.ts
// over-abstracted-helper for engineering-standards / solid-principles, and the
// team-question / team-design / team-structure / team-fix / eng-design-doc-review
// evals for product-thinking, the debugging lenses, and the doc methodologies).
//
// The no-prose-pins meta-tripwire (tests/no-prose-pins.test.ts) allowlists this
// file as the place wiring assertions on a skill/agent body may live.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();

// Flatten newlines so multi-line prose can be matched in one regex.
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

// Keep lines containing `key`, drop lines matching `exclude`, take the first 5,
// join. Isolates a single row from a methodology doc table.
function filterRows(text: string, key: string, exclude: RegExp): string {
  return text
    .split("\n")
    .filter((line) => line.includes(key))
    .filter((line) => !exclude.test(line))
    .slice(0, 5)
    .join("\n");
}

// ===========================================================================
// engineering-standards / solid-principles — agent->skill load links + the
// docs/skills.md consumer table. (Behavior: tests/code-reviewer.evals.ts
// over-abstracted-helper.)
// ===========================================================================

describe("engineering-standards wiring", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "engineering-standards", "SKILL.md");
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const PLANNER = join(REPO_ROOT, "agents", "planner.md");
  const IMPLEMENTER = join(REPO_ROOT, "agents", "implementer.md");
  const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");

  test("skill exists with name frontmatter", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*engineering-standards\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("planner / implementer / code-reviewer load engineering-standards", () => {
    for (const agent of [PLANNER, IMPLEMENTER, CODE_REVIEWER]) {
      expect(read(agent)).toContain("engineering-standards/SKILL.md");
    }
  });

  test("engineering-standards defers to solid-principles", () => {
    expect(read(SKILL_FILE)).toContain("solid-principles/SKILL.md");
  });

  test("implementer loads solid-principles + refactoring-to-patterns", () => {
    expect(read(IMPLEMENTER)).toContain("solid-principles/SKILL.md");
    expect(read(IMPLEMENTER)).toContain("refactoring-to-patterns/SKILL.md");
  });

  test("code-reviewer loads solid-principles + code-review", () => {
    expect(read(CODE_REVIEWER)).toContain("solid-principles/SKILL.md");
    expect(read(CODE_REVIEWER)).toContain("code-review/SKILL.md");
  });

  test("skills.md methodology table lists engineering-standards' three consumers", () => {
    const row = filterRows(read(SKILLS_MD), "engineering-standards", /^#|^>|\/\/|event/);
    expect(row.length).toBeGreaterThan(0);
    for (const agent of ["planner", "implementer", "code-reviewer"]) {
      expect(row).toContain(agent);
    }
  });

  test("skills.md code-review row lists its four consumers", () => {
    const row = filterRows(read(SKILLS_MD), "`code-review`", /^#|^>|SKILL\.md|\/\/|event/);
    for (const agent of ["code-reviewer", "security-reviewer", "ux-reviewer", "technical-writer"]) {
      expect(row).toContain(agent);
    }
  });

  test("skills.md lists solid-principles + refactoring-to-patterns rows", () => {
    expect(filterRows(read(SKILLS_MD), "solid-principles", /^#|^>|\/\/|event/).length).toBeGreaterThan(0);
    expect(filterRows(read(SKILLS_MD), "refactoring-to-patterns", /^#|^>|\/\/|event/).length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// product-thinking — frontmatter shape + the three agents' skills: load links +
// referential integrity of the headings the agents cite. (Behavior:
// team-question / team-design / team-structure evals.)
// ===========================================================================

describe("product-thinking wiring", () => {
  const SKILL_FILE = join(REPO_ROOT, "skills", "product-thinking", "SKILL.md");
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");
  const STRUCTURE_PLANNER = join(REPO_ROOT, "agents", "structure-planner.md");

  test("skill exists with name frontmatter", () => {
    expect(existsSync(SKILL_FILE)).toBe(true);
    expect(/^name:\s*product-thinking\s*$/m.test(frontmatter(read(SKILL_FILE)))).toBe(true);
  });

  test("frontmatter description names its three loaders", () => {
    const descBlock = read(SKILL_FILE)
      .split("\n")
      .slice(0, 10)
      .filter((line) => /^description:/.test(line))
      .join("\n");
    for (const loader of ["questioner", "design-author", "structure-planner"]) {
      expect(descBlock).toContain(loader);
    }
  });

  test("methodology-skill frontmatter shape: only name + description", () => {
    const fm = frontmatter(read(SKILL_FILE));
    expect(/^argument-hint:|^model:|^tools:|^permissionMode:/m.test(fm)).toBe(false);
    expect(/^name:/m.test(fm)).toBe(true);
    expect(/^description:/m.test(fm)).toBe(true);
  });

  test("questioner / design-author / structure-planner load product-thinking", () => {
    for (const agent of [QUESTIONER, DESIGN_AUTHOR, STRUCTURE_PLANNER]) {
      const fm = frontmatter(read(agent));
      expect(/^skills:/m.test(fm)).toBe(true);
      expect(/product-thinking|team:product-thinking/.test(fm)).toBe(true);
    }
  });

  test("every ## When ... heading the agents cite resolves to a real skill heading", () => {
    const skillText = read(SKILL_FILE);
    const agentTexts = [read(QUESTIONER), read(DESIGN_AUTHOR), read(STRUCTURE_PLANNER)];
    for (const heading of ["## When Framing the Task", "## When Designing", "## When Slicing"]) {
      expect(agentTexts.some((t) => t.includes(heading))).toBe(true);
      expect(skillText).toContain(heading);
    }
  });
});

// ===========================================================================
// agent-open-questions protocol — file existence + the skills that cross-link
// it. (Behavior: the envelope round-trip is exercised by the team-question /
// team-design evals.)
// ===========================================================================

describe("agent-open-questions wiring", () => {
  const AOQ_SKILL = join(REPO_ROOT, "skills", "agent-open-questions", "SKILL.md");
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const QRSPI_SKILL = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");
  const CLAUDE_MD = join(REPO_ROOT, "CLAUDE.md");

  test("skill exists with name + description frontmatter", () => {
    expect(existsSync(AOQ_SKILL)).toBe(true);
    const fm = frontmatter(read(AOQ_SKILL));
    expect(/^name:\s*agent-open-questions\s*$/m.test(fm)).toBe(true);
    expect(/^description:\s*\S/m.test(fm)).toBe(true);
  });

  test("team + qrspi-workflow cross-link agent-open-questions", () => {
    expect(read(TEAM_SKILL)).toContain("agent-open-questions");
    expect(read(QRSPI_SKILL)).toContain("agent-open-questions");
  });

  test("CLAUDE.md keeps the '## Skills (N)' index heading", () => {
    expect(/^## Skills \(\d+\)/m.test(read(CLAUDE_MD))).toBe(true);
  });

  test("shipit exists as a runtime skill (under skills/, not .claude/)", () => {
    expect(existsSync(join(REPO_ROOT, "skills", "shipit", "SKILL.md"))).toBe(true);
  });
});

// ===========================================================================
// AskUserQuestion contract — only the orchestrator/skills prompt the user; the
// interactive agents must NOT be granted the tool and instead emit the envelope.
// ===========================================================================

describe("ask-user-question wiring", () => {
  const DESIGN_AUTHOR = join(REPO_ROOT, "agents", "design-author.md");
  const QUESTIONER = join(REPO_ROOT, "agents", "questioner.md");
  const TEAM_DESIGN = join(REPO_ROOT, "skills", "team-design", "SKILL.md");
  const TEAM_STRUCTURE = join(REPO_ROOT, "skills", "team-structure", "SKILL.md");
  const TEAM_IMPLEMENT = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");

  test("design-author + questioner frontmatter excludes AskUserQuestion", () => {
    for (const agent of [DESIGN_AUTHOR, QUESTIONER]) {
      expect(/^tools:.*\bAskUserQuestion\b/m.test(frontmatter(read(agent)))).toBe(false);
    }
  });

  test("design-author + questioner route interaction through agent-open-questions", () => {
    for (const agent of [DESIGN_AUTHOR, QUESTIONER]) {
      expect(read(agent)).toContain("agent-open-questions");
    }
  });

  test("the gate skills + orchestrator reference AskUserQuestion", () => {
    for (const skill of [TEAM_DESIGN, TEAM_STRUCTURE, TEAM_IMPLEMENT, TEAM_SKILL]) {
      expect(read(skill)).toContain("AskUserQuestion");
    }
  });

  test("team-design + team-structure dropped the free-text approve prompt", () => {
    expect(/"Do you\s+approve/.test(read(TEAM_DESIGN))).toBe(false);
    expect(/"Do you\s+approve/.test(read(TEAM_STRUCTURE))).toBe(false);
  });
});

// ===========================================================================
// Multi-repo wiring — the artifacts + commands that make multi-repo mode work,
// and the research-isolation safety invariant (file-finder must never read the
// user's framing).
// ===========================================================================

describe("multi-repo + research-isolation wiring", () => {
  const TEAM_WT = join(REPO_ROOT, "skills", "team-worktree", "SKILL.md");
  const TEAM_RES = join(REPO_ROOT, "skills", "team-research", "SKILL.md");
  const QRSPI = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");
  const RESEARCHER = join(REPO_ROOT, "agents", "researcher.md");
  const FILE_FINDER = join(REPO_ROOT, "agents", "file-finder.md");

  test("qrspi-workflow documents the repos.md artifact + phase", () => {
    const text = read(QRSPI);
    expect(text).toContain("repos.md");
    expect(text).toContain("phase: repos");
  });

  test("team-worktree reads repos.md and runs per-repo git worktree add", () => {
    const text = read(TEAM_WT);
    expect(text).toContain("repos.md");
    expect(/git -C .* worktree add/.test(text)).toBe(true);
  });

  test("team-worktree uses --git-common-dir for layout-independent detection", () => {
    expect(read(TEAM_WT)).toContain("--git-common-dir");
  });

  test("team-research dispatch forwards repos.md", () => {
    expect(read(TEAM_RES)).toContain("repos.md");
  });

  test("researcher may read repos.md for scope, not intent", () => {
    const text = read(RESEARCHER);
    expect(text).toContain("repos.md");
    expect(text).toContain("scope, not intent");
  });

  test("file-finder must never read task.md or enumerate docs/plans/", () => {
    const text = flat(read(FILE_FINDER));
    expect(/MUST NOT.*task\.md/i.test(text)).toBe(true);
    expect(
      /\b(enumerate|glob|list)\b.{0,40}docs\/plans\/|docs\/plans\/.{0,40}\b(enumerate|glob|list)\b/i.test(text),
    ).toBe(true);
  });
});

// ===========================================================================
// SOFT-gate severity cross-reference (issue #68) — qrspi-workflow must point at
// the single severity model in code-review/SKILL.md, and that target must exist.
// Referential-integrity drift guard, not a prose pin.
// ===========================================================================

describe("SOFT-gate severity cross-reference (issue #68)", () => {
  const QRSPI = join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md");
  const CODE_REVIEW = join(REPO_ROOT, "skills", "code-review", "SKILL.md");

  function softSection(text: string): string {
    const lines = text.split("\n");
    const start = lines.findIndex((l) => /^### SOFT\b/.test(l));
    if (start === -1) return "";
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^### /.test(lines[i] ?? "")) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join("\n");
  }

  test("SOFT section does not restate code-review / ux-reviewer feedback as SOFT", () => {
    const soft = softSection(read(QRSPI));
    expect(soft.length).toBeGreaterThan(0);
    expect(/code review suggestions/i.test(soft)).toBe(false);
    expect(/UX review feedback/i.test(soft)).toBe(false);
  });

  test("SOFT section cross-references the severity-tier table", () => {
    const soft = softSection(read(QRSPI));
    expect(soft).toContain("code-review/SKILL.md");
    expect(soft).toContain("Severity Tiers and the Auto-Fix Boundary");
  });

  test("the cross-referenced heading still exists in code-review/SKILL.md", () => {
    expect(/^#{1,4} Severity Tiers and the Auto-Fix Boundary$/m.test(read(CODE_REVIEW))).toBe(true);
  });
});

// ===========================================================================
// L2-demoted heavy-prior-state skills — team, team-worktree, team-pr,
// team-implement have no cheap self-contained behavioral surface to eval, so
// their load-bearing STRUCTURAL contracts (phase table, gate structure, the
// commands they run) are pinned here as wiring. The sentinel comment below is
// required by tests/skill-eval-coverage.test.ts.
//
// L2-demoted (heavy prior state): team, team-worktree, team-pr, team-implement
// ===========================================================================

describe("L2-demoted heavy-prior-state pipeline skills", () => {
  const TEAM = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const TEAM_WT = join(REPO_ROOT, "skills", "team-worktree", "SKILL.md");
  const TEAM_PR = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
  const TEAM_IMPL = join(REPO_ROOT, "skills", "team-implement", "SKILL.md");

  test("team: the QRSPI phase table is present and ordered", () => {
    const text = read(TEAM);
    expect(/phase table/i.test(text)).toBe(true);
    expect(text).toContain(
      "Worktree → Question → Research → Design → Structure → Plan → Implement → PR",
    );
  });

  test("team: design approval is the only human gate (structure autonomous)", () => {
    const text = read(TEAM);
    expect(/### Human Gate \(design approval\)/.test(text)).toBe(true);
    expect(/### Structure \(no gate — autonomous\)/.test(text)).toBe(true);
    expect(/### Human Gate \(structure approval\)/.test(text)).toBe(false);
  });

  test("team-worktree: single-repo worktree-creation command contract", () => {
    const text = read(TEAM_WT);
    expect(text).toContain("single-repo mode");
    expect(text).toContain("worktree add .claude/worktrees/<branch>");
  });

  test("team-pr: opens a draft PR via gh pr create --draft", () => {
    expect(read(TEAM_PR)).toContain("gh pr create --draft");
  });

  test("team-implement: requires the structure + plan + worktree predecessors", () => {
    const text = read(TEAM_IMPL);
    expect(text).toContain("structure.md");
    expect(text).toContain("plan.md");
    expect(/worktree/i.test(text)).toBe(true);
  });
});

// ===========================================================================
// Tracker-move generic-runtime guard — the DISTRIBUTED skills must NOT hardcode
// this repo's board; the concrete binding lives only in the dev doc. Negative
// hardcode guards (not prose pins).
// ===========================================================================

describe("ticket-tracking hardcode guard", () => {
  const TEAM_SKILL = join(REPO_ROOT, "skills", "team", "SKILL.md");
  const TEAM_FIX = join(REPO_ROOT, "skills", "team-fix", "SKILL.md");
  const TEAM_PR = join(REPO_ROOT, "skills", "team-pr", "SKILL.md");
  const SHIPIT = join(REPO_ROOT, "skills", "shipit", "SKILL.md");
  const PROJECT_TRACKING = join(REPO_ROOT, "docs", "project-tracking.md");

  test("distributed skills never hardcode the dev board", () => {
    for (const skill of [TEAM_SKILL, TEAM_FIX, TEAM_PR, SHIPIT]) {
      const text = read(skill);
      expect(text).not.toContain("project-set-status");
      expect(text).not.toContain("projects/5");
    }
  });

  test("project-tracking dev doc binds the concrete board mechanism", () => {
    const text = read(PROJECT_TRACKING);
    expect(text).toContain("project-set-status.sh");
    expect(/"In review"/i.test(text)).toBe(true);
  });
});

// ===========================================================================
// Remaining methodology-lens load links — each lens must stay wired into its
// consumer (so the skill actually fires). The lenses' JUDGMENT is exercised
// behaviorally by the consuming-agent evals noted; this only pins the wiring.
//   documenting-decisions / technical-design-doc -> eng-design-doc-review eval
//   test-driven-bug-fix / systematic-debugging   -> team-fix eval
//   test-first-development                        -> team-structure / code-review
//   writing-prose                                 -> (technical-writer; no eval yet)
// ===========================================================================

describe("methodology-lens load links", () => {
  const cases: [string, string][] = [
    ["documenting-decisions", join(REPO_ROOT, "skills", "eng-design-doc-review", "SKILL.md")],
    ["technical-design-doc", join(REPO_ROOT, "skills", "eng-design-doc-review", "SKILL.md")],
    ["writing-prose", join(REPO_ROOT, "agents", "technical-writer.md")],
    ["systematic-debugging", join(REPO_ROOT, "skills", "test-driven-bug-fix", "SKILL.md")],
    ["test-driven-bug-fix", join(REPO_ROOT, "skills", "team-fix", "SKILL.md")],
    ["test-first-development", join(REPO_ROOT, "agents", "test-architect.md")],
  ];

  for (const [lens, consumer] of cases) {
    test(`${lens} is loaded by ${consumer.replace(REPO_ROOT + "/", "")}`, () => {
      expect(read(consumer)).toContain(lens);
    });
  }
});
