// Acceptance fence for the thin-agents-over-skills refactor: every agent
// file becomes an identity-only wrapper (60-90 lines) whose procedure lives
// in a preloaded methodology skill — 9 new skills plus folds into existing
// skills. L2 static-invariant tripwires per docs/testing.md: read source,
// assert the contract, execute nothing. The suite passes only when the
// whole refactor is complete.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { E2E_TOUCHFILES } from "./helpers/touchfiles";

const REPO_ROOT = process.cwd();

function agentPath(name: string): string {
  return join(REPO_ROOT, "agents", `${name}.md`);
}

function skillPath(name: string): string {
  return join(REPO_ROOT, "skills", name, "SKILL.md");
}

// Missing-file reads return "" so dependent checks fail as assertions
// (expected "" to contain ...), never as ENOENT crashes.
function readOrEmpty(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// Everything after the closing frontmatter marker.
function body(text: string): string {
  const parts = text.split(/^---$/m);
  return parts.slice(2).join("---");
}

// The `skills:` preload list from an agent's frontmatter, sorted.
function preloads(agentFile: string): string[] {
  const lines = frontmatter(readOrEmpty(agentFile)).split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (/^skills:\s*$/.test(line)) {
      inList = true;
      continue;
    }
    if (inList) {
      const match = line.match(/^\s+-\s+(\S+)\s*$/);
      if (match?.[1] !== undefined) out.push(match[1]);
      else inList = false;
    }
  }
  return out.sort();
}

const ALL_AGENTS = [
  "code-reviewer",
  "design-author",
  "file-finder",
  "implementer",
  "planner",
  "questioner",
  "researcher",
  "security-reviewer",
  "structure-planner",
  "technical-writer",
  "test-architect",
  "ux-reviewer",
  "verifier",
];

// The 2 remaining methodology skills, the agent whose procedure each one carries,
// and a marker string from the moved content that must survive the move.
const NEW_SKILLS: { skill: string; agent: string; anchor: string }[] = [
  { skill: "running-quality-checks", agent: "verifier", anchor: "speed order" },
  { skill: "verifying-ux", agent: "ux-reviewer", anchor: "curl" },
];


describe("thin agents: new methodology skills exist with the methodology-skill frontmatter contract", () => {
  for (const { skill } of NEW_SKILLS) {
    test(`skills/${skill}/SKILL.md exists`, () => {
      expect(existsSync(skillPath(skill))).toBe(true);
    });

    test(`${skill} frontmatter: name, description, user-invocable false, no effort`, () => {
      const fm = frontmatter(readOrEmpty(skillPath(skill)));
      expect(fm).toMatch(new RegExp(`^name: ${skill}$`, "m"));
      expect(fm).toMatch(/^description: .{20,}/m);
      expect(fm).toMatch(/^user-invocable: false$/m);
      expect(/^effort:/m.test(fm)).toBe(false);
    });

    test(`${skill} body is present`, () => {
      expect(readOrEmpty(skillPath(skill)).length).toBeGreaterThan(0);
    });
  }
});

describe("thin agents: new skills carry the moved procedure content", () => {
  for (const { skill, agent, anchor } of NEW_SKILLS) {
    test(`${skill} carries ${agent} procedure content (mentions "${anchor}")`, () => {
      expect(readOrEmpty(skillPath(skill))).toContain(anchor);
    });
  }
});

describe("thin agents: frontmatter skills preloads per agent", () => {
  const EXPECTED_PRELOADS: Record<string, string[]> = {
    "code-reviewer": ["cross-model-review", "nested-agents", "unslop", "writing-prose"],
    "design-author": ["unslop", "writing-prose"],
    "file-finder": ["unslop", "writing-prose"],
    implementer: ["nested-agents", "unslop", "writing-prose"],
    planner: ["unslop", "writing-prose"],
    questioner: ["unslop", "writing-prose"],
    researcher: ["nested-agents", "unslop", "writing-prose"],
    "security-reviewer": ["nested-agents", "unslop", "writing-prose"],
    "structure-planner": ["unslop", "writing-prose"],
    "technical-writer": ["unslop", "writing-prose"],
    "test-architect": ["unslop", "writing-prose"],
    "ux-reviewer": ["unslop", "verifying-ux", "writing-prose"],
    verifier: ["running-quality-checks", "unslop", "writing-prose"],
  };

  for (const [agent, expected] of Object.entries(EXPECTED_PRELOADS)) {
    test(`${agent} preloads exactly: ${expected.join(", ")}`, () => {
      expect(preloads(agentPath(agent))).toEqual(expected);
    });
  }
});

// ---------------------------------------------------------------------------
// The soft limit is three preloaded skills, and every name in a `skills:` list
// counts toward the number it justifies. A budget that lets a category of name
// "not count" is unfalsifiable: every agent past three has a reason available
// and none of them is written down. The budget stays soft; the record is
// mechanical. PRELOAD_BUDGET_REASONS is that record, exactly as
// EXPECTED_GUARDED (tests/guarded-skill-prose.test.ts) is the record for the
// guarded set.
//
// The agent set comes from disk, so a fourteenth agent file is counted without
// editing this file: a hardcoded thirteen would hide it from the rule this
// exists to enforce.
// ---------------------------------------------------------------------------

const PRELOAD_BUDGET = 3;

type BudgetReason = { count: number; reason: string };

const PRELOAD_BUDGET_REASONS: Record<string, BudgetReason> = {
  "code-reviewer": {
    count: 4,
    reason:
      "It keeps the vendor and nested-agent procedures plus the shared `writing-prose` and `unslop` owners.",
  },
};

// The four offender rules, factored so the planted-positive test can run each
// one against synthetic input instead of trusting that it fired on real data.
function overBudgetWithNoReason(
  counted: Map<string, string[]>,
  reasons: Record<string, BudgetReason>,
): string[] {
  return [...counted]
    .filter(([agent, names]) => names.length > PRELOAD_BUDGET && reasons[agent] === undefined)
    .map(([agent, names]) => `${agent}: preloads ${names.length} names, no recorded reason`);
}

function reasonWithoutABudgetToJustify(
  counted: Map<string, string[]>,
  reasons: Record<string, BudgetReason>,
): string[] {
  return Object.keys(reasons)
    .filter((agent) => (counted.get(agent)?.length ?? 0) <= PRELOAD_BUDGET)
    .map((agent) =>
      counted.has(agent)
        ? `${agent}: recorded reason for an agent at or under the budget`
        : `${agent}: recorded reason for a name that is not an agent`,
    );
}

function reasonMisstatesItsCount(
  counted: Map<string, string[]>,
  reasons: Record<string, BudgetReason>,
): string[] {
  const offenders: string[] = [];
  for (const [agent, entry] of Object.entries(reasons)) {
    const actual = counted.get(agent)?.length;
    if (actual !== undefined && entry.count !== actual) {
      offenders.push(`${agent}: records ${entry.count} names, preloads ${actual}`);
    }
    if (entry.reason.trim() === "") offenders.push(`${agent}: empty reason`);
  }
  return offenders;
}

// `preloads()` opens on `/^skills:\s*$/` and reads indented `-` lines, so an
// inline `skills: [a, b, c, d]` parses to zero names and clears the budget in
// silence. Two sibling parsers make the same assumption, so the block form is
// the contract — assert it rather than teach three parsers a second shape.
function inlineSkillsKey(frontmatters: Map<string, string>): string[] {
  return [...frontmatters]
    .filter(([, fm]) => /^skills:[ \t]*\S/m.test(fm))
    .map(([agent]) => `${agent}: skills: is an inline list, not a block list`);
}

describe("every preloaded name counts against the budget", () => {
  const agentNames = readdirSync(join(REPO_ROOT, "agents"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();
  const counted = new Map(agentNames.map((agent) => [agent, preloads(agentPath(agent))]));
  const frontmatters = new Map(
    agentNames.map((agent) => [agent, frontmatter(readOrEmpty(agentPath(agent)))]),
  );

  // Guard: a mis-parsed agents/ tree would empty every offender array below.
  // It counts agents and parsed names, never entries — zero entries is a legal
  // end state, so an entry-count guard would forbid the budget being met.
  test("the agent parse covers every agent file and finds preloaded names", () => {
    const files = readdirSync(join(REPO_ROOT, "agents")).filter((name) => name.endsWith(".md"));
    expect(agentNames.length).toBe(files.length);
    expect(agentNames.length).toBeGreaterThanOrEqual(13);
    const total = [...counted.values()].reduce((sum, names) => sum + names.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  test("every agent past the preload budget has a recorded reason", () => {
    expect(overBudgetWithNoReason(counted, PRELOAD_BUDGET_REASONS)).toEqual([]);
  });

  test("every recorded reason keys an agent that is past the budget", () => {
    expect(reasonWithoutABudgetToJustify(counted, PRELOAD_BUDGET_REASONS)).toEqual([]);
  });

  test("every recorded reason states the count it justifies, and says why", () => {
    expect(reasonMisstatesItsCount(counted, PRELOAD_BUDGET_REASONS)).toEqual([]);
  });

  test("every agent declares skills: as a block list", () => {
    expect(inlineSkillsKey(frontmatters)).toEqual([]);
  });

  // Prove each rule can find a positive: four planted violations, one per
  // failure mode the budget can hide.
  test("the budget checks can see planted violations", () => {
    const overBudget = new Map([["planted-agent", ["a", "b", "c", "d"]]]);
    expect(overBudgetWithNoReason(overBudget, {})).toEqual([
      "planted-agent: preloads 4 names, no recorded reason",
    ]);

    const underBudget = new Map([["planted-agent", ["a"]]]);
    const spuriousReason = { "planted-agent": { count: 1, reason: "planted" } };
    expect(reasonWithoutABudgetToJustify(underBudget, spuriousReason)).toEqual([
      "planted-agent: recorded reason for an agent at or under the budget",
    ]);

    const wrongCount = { "planted-agent": { count: 5, reason: "planted" } };
    expect(reasonMisstatesItsCount(overBudget, wrongCount)).toEqual([
      "planted-agent: records 5 names, preloads 4",
    ]);

    const inline = new Map([["planted-agent", "name: planted-agent\nskills: [a, b, c, d]"]]);
    expect(inlineSkillsKey(inline)).toEqual([
      "planted-agent: skills: is an inline list, not a block list",
    ]);
  });
});

describe("thin agents: wrapper bodies point at their procedure skills", () => {
  // Convention: a wrapper keeps a one-line pointer (or a preload note
  // naming the path) for each skill it runs on — the body must name it.
  for (const { skill, agent } of NEW_SKILLS) {
    test(`${agent} body names ${skill}`, () => {
      expect(body(readOrEmpty(agentPath(agent)))).toContain(skill);
    });
  }
});

describe("thin agents: fold targets absorbed the moved methodology", () => {
  test("engineering-standards absorbs the implementer quality bullets (Construct with collaborators)", () => {
    expect(readOrEmpty(skillPath("engineering-standards"))).toContain("Construct with collaborators");
  });

  test("testing rules carry the test-architect audit bar; the implement playbook points at it", () => {
    // The audit bar folded into test-first-development during the
    // thin-agents refactor, then moved to the just-in-time test-style skill,
    // then into the shared testing reference in the playbook consolidation.
    expect(readOrEmpty(join(REPO_ROOT, "skills", "team", "references", "testing.md"))).toContain(
      "| Deterministic inputs |",
    );
    expect(readOrEmpty(join(REPO_ROOT, "skills", "team", "playbooks", "implement.md"))).toContain(
      "references/testing.md",
    );
  });

  test("security-reviewer brief carries the security methodology; code-reviewer brief keeps the pointer", () => {
    // The security-reviewer methodology folded into code-review during the
    // thin-agents refactor, then moved to its own just-in-time skill, then
    // into a reference owned by code-review.
    const securityBrief = readOrEmpty(join(REPO_ROOT, "skills", "code-review", "references", "security-reviewer.md"));
    expect(securityBrief).toContain("OWASP");
    expect(securityBrief).toContain("CRITICAL — Hard Gate");
    const codeReviewer = readOrEmpty(join(REPO_ROOT, "skills", "code-review", "references", "code-reviewer.md"));
    expect(codeReviewer).toContain("security reviewer brief");
  });

  test("code-reviewer brief absorbs the code-reviewer inspection checklist (off-by-one)", () => {
    expect(readOrEmpty(join(REPO_ROOT, "skills", "code-review", "references", "code-reviewer.md"))).toContain("off-by-one");
  });

  test("documentation-reviewer brief carries the technical-writer doc-change classification; writing-prose keeps the pointer", () => {
    // The doc-change classification folded into writing-prose during the
    // thin-agents refactor, then moved to the just-in-time
    // reviewing-documentation skill (preloaded by technical-writer), then
    // into a reference owned by code-review.
    const documentationBrief = readOrEmpty(join(REPO_ROOT, "skills", "code-review", "references", "documentation-reviewer.md"));
    expect(documentationBrief).toContain("REQUIRED");
    expect(documentationBrief).toContain("RECOMMENDED");
    expect(documentationBrief).toContain("Documentation-Gap Review Process");
    expect(readOrEmpty(skillPath("writing-prose"))).toContain(
      "code-review/references/documentation-reviewer.md",
    );
  });

  test("nested-agents body carries the folded scout caps", () => {
    expect(body(readOrEmpty(skillPath("nested-agents")))).toMatch(/scout/i);
  });

  test("nested-agents body carries the folded skeptic-pass caps", () => {
    expect(body(readOrEmpty(skillPath("nested-agents")))).toMatch(/skeptic/i);
  });

  test("nested-agents per-agent caps name all four Agent-tool holders in the body", () => {
    const content = body(readOrEmpty(skillPath("nested-agents")));
    for (const holder of ["researcher", "implementer", "code-reviewer", "security-reviewer"]) {
      expect(content).toContain(holder);
    }
  });
});

describe("thin agents: duplicated summaries deleted from wrappers", () => {
  test("implementer no longer inlines the SOLID summary", () => {
    expect(readOrEmpty(agentPath("implementer"))).not.toContain('No "and" in names');
  });

  test("implementer no longer inlines the refactoring summary", () => {
    expect(readOrEmpty(agentPath("implementer"))).not.toContain("Name the smell and the pattern");
  });

  test("implementer no longer restates comment discipline", () => {
    expect(readOrEmpty(agentPath("implementer"))).not.toContain("No commented-out code");
  });

  test("code-reviewer no longer restates comment discipline", () => {
    expect(readOrEmpty(agentPath("code-reviewer"))).not.toContain("commented-out code");
  });

  test("code-reviewer no longer inlines the inspection checklist", () => {
    expect(readOrEmpty(agentPath("code-reviewer"))).not.toContain("off-by-one");
  });

  test("questioner no longer restates the envelope protocol details", () => {
    expect(readOrEmpty(agentPath("questioner"))).not.toContain("single label-only question");
  });

  test("design-author no longer inlines the envelope example", () => {
    expect(readOrEmpty(agentPath("design-author"))).not.toContain("Example envelope");
  });
});

describe("thin agents: haiku skills are self-contained", () => {
  // verifier and file-finder run on haiku, which cannot be trusted to chase
  // cross-references — their skills must carry everything inline.
  for (const skill of ["running-quality-checks"]) {
    test(`${skill} has no skills/ cross-references`, () => {
      const content = readOrEmpty(skillPath(skill));
      expect(content.length).toBeGreaterThan(0);
      expect(content).not.toContain("skills/");
    });
  }
});

describe("thin agents: skills catalog stays complete", () => {
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");

  for (const { skill } of NEW_SKILLS) {
    test(`docs/skills.md documents ${skill}`, () => {
      expect(read(SKILLS_MD)).toContain(`### [${skill}](`);
    });
  }
});

describe("thin agents: name-collision pairs documented", () => {
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const COLLISION_PAIRS: [string, string][] = [
    ["verifying-ux", "ux-reviewer"],
  ];

  for (const [skill, agent] of COLLISION_PAIRS) {
    test(`collision row ${skill} / ${agent} exists`, () => {
      const row = new RegExp(`^\\|\\s*\`${skill}\`\\s*\\|\\s*\`${agent}\`\\s*\\|`, "m");
      expect(read(SKILLS_MD)).toMatch(row);
    });
  }
});

describe("thin agents: eval diff-selection keeps firing on the new skills", () => {
  const TOUCHFILE_ADDITIONS: Record<string, string[]> = {
    "team-question-neutral-questions": ["skills/team/playbooks/question.md", "skills/team/references/question-templates.md"],
    "team-design-seeded-research-and-task": ["skills/team/playbooks/design.md", "skills/team/references/design-template.md"],
    "team-research-answers-seeded-questions": ["skills/team/playbooks/research.md"],
    "team-structure-seeded-design": ["skills/team/references/dependencies.md", "skills/team/playbooks/structure.md", "skills/team/references/structure-template.md"],
    "team-plan-seeded-structure": ["skills/team/references/dependencies.md", "skills/team/playbooks/plan.md"],
    "team-fix-test-first-ordering": ["skills/team-fix/references/diagnosis.md"],
    "eng-design-doc-review-planted-missing-alternatives": ["skills/team/references/design-template.md", "skills/team/references/decisions.md", "skills/eng-design-doc-review/references/design-reviewer.md"],
  };

  const FIXTURE_INPUTS: Record<string, string> = {
    "team-question-neutral-questions": "evals/fixtures/team-question/neutral-questions/input.md",
    "team-design-seeded-research-and-task": "evals/fixtures/team-design/seeded-research-and-task/input.md",
    "team-research-answers-seeded-questions": "evals/fixtures/team-research/answers-seeded-questions/input.md",
    "team-structure-seeded-design": "evals/fixtures/team-structure/seeded-design/input.md",
    "team-plan-seeded-structure": "evals/fixtures/team-plan/seeded-structure/input.md",
    "team-fix-test-first-ordering": "evals/fixtures/team-fix/test-first-ordering/input.md",
    "eng-design-doc-review-planted-missing-alternatives": "evals/fixtures/eng-design-doc-review/planted-missing-alternatives/input.md",
  };

  // Locks the expectation the binder below consumes. The binder only checks the
  // globs it is handed against the selection map (tests/helpers/touchfiles.ts),
  // so deleting the design-reviewer brief path from TOUCHFILE_ADDITIONS would
  // silence the binder instead of failing it. This assertion makes that
  // deletion red here.
  test("TOUCHFILE_ADDITIONS declares the design-reviewer brief path", () => {
    expect(TOUCHFILE_ADDITIONS["eng-design-doc-review-planted-missing-alternatives"]).toContain(
      "skills/eng-design-doc-review/references/design-reviewer.md",
    );
  });

  for (const [evalName, globs] of Object.entries(TOUCHFILE_ADDITIONS)) {
    test(`E2E_TOUCHFILES[${evalName}] lists the new skill globs`, () => {
      const entry = E2E_TOUCHFILES[evalName] ?? [];
      for (const glob of globs) {
        expect(entry).toContain(glob);
      }
    });

    test(`fixture deps for ${evalName} mirror the new skill globs`, () => {
      const fixturePath = FIXTURE_INPUTS[evalName] ?? "";
      const fm = frontmatter(readOrEmpty(join(REPO_ROOT, fixturePath)));
      for (const glob of globs) {
        expect(fm).toContain(glob);
      }
    });
  }
});
