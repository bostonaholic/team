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

// wc -l semantics: count newline characters.
function lineCount(text: string): number {
  return (text.match(/\n/g) ?? []).length;
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

describe("thin agents: wrapper size band", () => {
  // Every agent file is identity + dispatch contract + skill pointers only.
  // The 60-90 line band is the structure's whole-refactor sweep criterion.
  for (const agent of ALL_AGENTS) {
    test(`agents/${agent}.md is a thin wrapper (60-90 lines)`, () => {
      const lines = lineCount(readOrEmpty(agentPath(agent)));
      expect(lines).toBeGreaterThanOrEqual(60);
      expect(lines).toBeLessThanOrEqual(90);
    });
  }
});

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

    test(`${skill} body is present and under 500 lines`, () => {
      const lines = lineCount(readOrEmpty(skillPath(skill)));
      expect(lines).toBeGreaterThan(0);
      expect(lines).toBeLessThan(500);
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
    "code-reviewer": ["code-review", "nested-agents", "progress-tracking"],
    "design-author": ["agent-open-questions", "authoring-designs", "product-thinking", "progress-tracking"],
    "file-finder": ["finding-files"],
    implementer: ["implementing-slices", "nested-agents", "progress-tracking"],
    planner: ["planning-implementation", "progress-tracking"],
    questioner: ["agent-open-questions", "decomposing-intent", "product-thinking", "progress-tracking"],
    researcher: ["nested-agents", "progress-tracking", "researching-codebases"],
    "security-reviewer": ["code-review", "nested-agents", "progress-tracking"],
    "structure-planner": ["product-thinking", "progress-tracking", "slicing-work"],
    "technical-writer": ["code-review", "progress-tracking", "writing-prose"],
    "test-architect": ["progress-tracking", "test-first-development"],
    "ux-reviewer": ["code-review", "progress-tracking", "verifying-ux"],
    verifier: ["progress-tracking", "running-quality-checks"],
  };

  for (const [agent, expected] of Object.entries(EXPECTED_PRELOADS)) {
    test(`${agent} preloads exactly: ${expected.join(", ")}`, () => {
      expect(preloads(agentPath(agent))).toEqual(expected);
    });
  }
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

  test("test-first-development absorbs the test-architect audit bar (Deterministic inputs row)", () => {
    expect(readOrEmpty(skillPath("test-first-development"))).toContain("| Deterministic inputs |");
  });

  test("code-review absorbs the security-reviewer severity methodology and stays under 500 lines", () => {
    const content = readOrEmpty(skillPath("code-review"));
    expect(content).toContain("OWASP");
    expect(lineCount(content)).toBeLessThan(500);
  });

  test("code-review absorbs the code-reviewer inspection checklist (off-by-one)", () => {
    expect(readOrEmpty(skillPath("code-review"))).toContain("off-by-one");
  });

  test("writing-prose absorbs the technical-writer doc-change classification (REQUIRED/RECOMMENDED)", () => {
    const content = readOrEmpty(skillPath("writing-prose"));
    expect(content).toContain("REQUIRED");
    expect(content).toContain("RECOMMENDED");
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

describe("thin agents: documentation counts agree at 36 skills", () => {
  // 40 post-refactor skills minus the 4 single-referencer skills embedded
  // into their sole consumers (git-commit -> team-pr, test-driven-bug-fix
  // -> team-fix, technical-design-doc + documenting-decisions ->
  // eng-design-doc-review bundled reference files).
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const ARCHITECTURE_MD = join(REPO_ROOT, "docs", "architecture.md");

  test("skills/ holds exactly 36 SKILL.md files", () => {
    const count = readdirSync(join(REPO_ROOT, "skills")).filter((name) =>
      existsSync(join(REPO_ROOT, "skills", name, "SKILL.md")),
    ).length;
    expect(count).toBe(36);
  });

  test("AGENTS.md heading reads Skills (36)", () => {
    expect(read(join(REPO_ROOT, "AGENTS.md"))).toContain("## Skills (36)");
  });

  test("docs/skills.md description counts 36 skills", () => {
    expect(read(SKILLS_MD).replace(/\s+/g, " ")).toContain("36 skills");
  });

  test("docs/skills.md split sentence sums to 36", () => {
    expect(read(SKILLS_MD).replace(/\s+/g, " ")).toContain(
      "11 pipeline entry-point + 1 standalone utility + 24 methodology = 36",
    );
  });

  test("docs/architecture.md counts all 36 skills and no stale 31", () => {
    const content = read(ARCHITECTURE_MD);
    expect(content).toContain("all 36 skills");
    expect(content).not.toContain("31 skills");
  });

  test("the four embedded single-referencer skill dirs are gone", () => {
    for (const name of [
      "git-commit",
      "test-driven-bug-fix",
      "technical-design-doc",
      "documenting-decisions",
    ]) {
      expect(existsSync(join(REPO_ROOT, "skills", name))).toBe(false);
    }
  });

  test("eng-design-doc-review carries the two bundled reference files", () => {
    const dir = join(REPO_ROOT, "skills", "eng-design-doc-review");
    expect(existsSync(join(dir, "technical-design-doc.md"))).toBe(true);
    expect(existsSync(join(dir, "documenting-decisions.md"))).toBe(true);
  });

  test("docs/architecture.md exempts own-procedure skills from the 3-skill soft limit", () => {
    const content = read(ARCHITECTURE_MD);
    expect(content).toMatch(/procedure skill/i);
    expect(content).toMatch(/does not count/i);
  });

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
  };

  const FIXTURE_INPUTS: Record<string, string> = {
    "team-question-neutral-questions": "evals/fixtures/team-question/neutral-questions/input.md",
    "team-design-seeded-research-and-task": "evals/fixtures/team-design/seeded-research-and-task/input.md",
    "team-research-answers-seeded-questions": "evals/fixtures/team-research/answers-seeded-questions/input.md",
    "team-structure-seeded-design": "evals/fixtures/team-structure/seeded-design/input.md",
    "team-plan-seeded-structure": "evals/fixtures/team-plan/seeded-structure/input.md",
  };

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
