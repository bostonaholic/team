// Acceptance fence for the thin-agents-over-skills refactor: every agent
// file becomes an identity-only wrapper (60-90 lines) whose procedure lives
// in a preloaded methodology skill — 9 new skills plus folds into existing
// skills. L2 static-invariant tripwires per docs/testing.md: read source,
// assert the contract, execute nothing. The suite passes only when the
// whole refactor is complete.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read, squash } from "./helpers/text";
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

// The 9 new methodology skills, the agent whose procedure each one carries,
// and a marker string from the moved content that must survive the move.
const NEW_SKILLS: { skill: string; agent: string; anchor: string }[] = [
  { skill: "implementing-slices", agent: "implementer", anchor: "acceptance test" },
  { skill: "running-quality-checks", agent: "verifier", anchor: "speed order" },
  { skill: "verifying-ux", agent: "ux-reviewer", anchor: "curl" },
  { skill: "decomposing-intent", agent: "questioner", anchor: "questions.md" },
  { skill: "authoring-designs", agent: "design-author", anchor: "design.md" },
  { skill: "researching-codebases", agent: "researcher", anchor: "research.md" },
  { skill: "finding-files", agent: "file-finder", anchor: "questions.md" },
  { skill: "slicing-work", agent: "structure-planner", anchor: "structure.md" },
  { skill: "planning-implementation", agent: "planner", anchor: "plan.md" },
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
    "code-reviewer": ["conventional-comments", "cross-model-review", "nested-agents", "principle-progress-tracking", "reviewing-code"],
    "design-author": ["authoring-designs", "principle-progress-tracking", "product-thinking", "writing-prose"],
    "file-finder": ["finding-files"],
    implementer: ["implementing-slices", "nested-agents", "principle-progress-tracking"],
    planner: ["planning-implementation", "principle-progress-tracking", "systems-thinking"],
    questioner: ["decomposing-intent", "principle-progress-tracking", "product-thinking"],
    researcher: ["nested-agents", "principle-progress-tracking", "researching-codebases", "systems-thinking"],
    "security-reviewer": ["conventional-comments", "nested-agents", "principle-progress-tracking", "reviewing-code", "reviewing-security"],
    "structure-planner": ["principle-progress-tracking", "product-thinking", "slicing-work", "systems-thinking"],
    "technical-writer": ["conventional-comments", "principle-progress-tracking", "reviewing-code", "reviewing-documentation", "writing-prose"],
    "test-architect": ["principle-progress-tracking", "test-first-development"],
    "ux-reviewer": ["principle-progress-tracking", "reviewing-code", "verifying-ux"],
    verifier: ["principle-progress-tracking", "running-quality-checks"],
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
// The agent set comes from disk, never from ALL_AGENTS: a hardcoded thirteen
// would hide a fourteenth agent from the rule this exists to enforce.
// ---------------------------------------------------------------------------

const PRELOAD_BUDGET = 3;

type BudgetReason = { count: number; reason: string };

const PRELOAD_BUDGET_REASONS: Record<string, BudgetReason> = {
  "code-reviewer": {
    count: 5,
    reason:
      "It is the only reviewer that runs vendor CLIs, so `cross-model-review` carries a procedure no other agent needs and `nested-agents` carries the courier cap that bounds it.",
  },
  "security-reviewer": {
    count: 5,
    reason:
      "Two review manuals, not one: `reviewing-code` holds the verdict discipline every reviewer shares, `reviewing-security` holds the threat-model pass only this agent runs, and inlining either would fork a manual other agents cite by name.",
  },
  "technical-writer": {
    count: 5,
    reason:
      "Same shape: `reviewing-code` for the shared verdict discipline, `reviewing-documentation` for the doc-review pass it alone runs, and `writing-prose` for house style that several other surfaces also load.",
  },
  "design-author": {
    count: 4,
    reason:
      "Its own extracted procedure (`authoring-designs`) sits beside two shared lenses; inlining the procedure would put a 200-line method inside an agent prompt.",
  },
  researcher: {
    count: 4,
    reason:
      "Its own extracted procedure (`researching-codebases`) plus the `nested-agents` guardrail it needs because it holds the `Agent` tool; neither belongs inside the other.",
  },
  "structure-planner": {
    count: 4,
    reason:
      "Its own extracted procedure (`slicing-work`) plus the two lenses that decide slice order (`product-thinking`, `systems-thinking`), both shared with other agents.",
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

  test("test-style carries the test-architect audit bar; test-first-development points at it", () => {
    // The audit bar folded into test-first-development during the
    // thin-agents refactor, then moved to the just-in-time test-style skill.
    expect(readOrEmpty(skillPath("test-style"))).toContain("| Deterministic inputs |");
    expect(readOrEmpty(skillPath("test-first-development"))).toContain("test-style/SKILL.md");
  });

  test("reviewing-security carries the security methodology; code-review keeps the pointer", () => {
    // The security-reviewer methodology folded into code-review during the
    // thin-agents refactor, then moved to its own just-in-time skill.
    const reviewingSecurity = readOrEmpty(skillPath("reviewing-security"));
    expect(reviewingSecurity).toContain("OWASP");
    expect(reviewingSecurity).toContain("CRITICAL — Hard Gate");
    const codeReview = readOrEmpty(skillPath("reviewing-code"));
    expect(codeReview).toContain("reviewing-security/SKILL.md");
  });

  test("reviewing-code absorbs the code-reviewer inspection checklist (off-by-one)", () => {
    expect(readOrEmpty(skillPath("reviewing-code"))).toContain("off-by-one");
  });

  test("reviewing-documentation carries the technical-writer doc-change classification; writing-prose keeps the pointer", () => {
    // The doc-change classification folded into writing-prose during the
    // thin-agents refactor, then moved to the just-in-time
    // reviewing-documentation skill (preloaded by technical-writer).
    const reviewingDocumentation = readOrEmpty(skillPath("reviewing-documentation"));
    expect(reviewingDocumentation).toContain("REQUIRED");
    expect(reviewingDocumentation).toContain("RECOMMENDED");
    expect(reviewingDocumentation).toContain("Documentation-Gap Review Process");
    expect(readOrEmpty(skillPath("writing-prose"))).toContain(
      "reviewing-documentation/SKILL.md",
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
  for (const skill of ["finding-files", "running-quality-checks"]) {
    test(`${skill} has no skills/ cross-references`, () => {
      const content = readOrEmpty(skillPath(skill));
      expect(content.length).toBeGreaterThan(0);
      expect(content).not.toContain("skills/");
    });
  }
});

describe("thin agents: skills catalog stays complete", () => {
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const ARCHITECTURE_MD = join(REPO_ROOT, "docs", "architecture.md");


  for (const { skill } of NEW_SKILLS) {
    test(`docs/skills.md documents ${skill}`, () => {
      expect(read(SKILLS_MD)).toContain(`\`${skill}\``);
    });
  }
});

describe("thin agents: name-collision pairs documented", () => {
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const COLLISION_PAIRS: [string, string][] = [
    ["finding-files", "file-finder"],
    ["authoring-designs", "design-author"],
    ["implementing-slices", "implementer"],
    ["planning-implementation", "planner"],
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
    "team-question-neutral-questions": ["skills/decomposing-intent/**"],
    "team-design-seeded-research-and-task": ["skills/authoring-designs/**"],
    "team-research-answers-seeded-questions": ["skills/researching-codebases/**", "skills/finding-files/**"],
    "team-structure-seeded-design": ["skills/slicing-work/**"],
    "team-plan-seeded-structure": ["skills/planning-implementation/**"],
    "eng-design-doc-review-planted-missing-alternatives": ["skills/documenting-decisions/**", "skills/technical-design-doc/**", "skills/reviewing-designs/**"],
  };

  const FIXTURE_INPUTS: Record<string, string> = {
    "team-question-neutral-questions": "evals/fixtures/team-question/neutral-questions/input.md",
    "team-design-seeded-research-and-task": "evals/fixtures/team-design/seeded-research-and-task/input.md",
    "team-research-answers-seeded-questions": "evals/fixtures/team-research/answers-seeded-questions/input.md",
    "team-structure-seeded-design": "evals/fixtures/team-structure/seeded-design/input.md",
    "team-plan-seeded-structure": "evals/fixtures/team-plan/seeded-structure/input.md",
    "eng-design-doc-review-planted-missing-alternatives": "evals/fixtures/eng-design-doc-review/planted-missing-alternatives/input.md",
  };

  // The fixture that exercises the design review depends on
  // skills/reviewing-designs/, which holds the brief. Declaring the glob here
  // is what makes the binder below check the selection map
  // (tests/helpers/touchfiles.ts) against the fixture's own `deps`
  // frontmatter for it, exactly as it does for the fixture's two siblings.
  test("TOUCHFILE_ADDITIONS declares the reviewing-designs glob", () => {
    expect(TOUCHFILE_ADDITIONS["eng-design-doc-review-planted-missing-alternatives"]).toContain(
      "skills/reviewing-designs/**",
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
