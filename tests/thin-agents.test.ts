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
    "code-reviewer": ["code-review", "conventional-comments", "cross-model-review", "nested-agents", "principle-progress-tracking"],
    "design-author": ["authoring-designs", "principle-progress-tracking", "product-thinking", "writing-prose"],
    "file-finder": ["finding-files"],
    implementer: ["implementing-slices", "nested-agents", "principle-progress-tracking"],
    planner: ["planning-implementation", "principle-progress-tracking", "systems-thinking"],
    questioner: ["decomposing-intent", "principle-progress-tracking", "product-thinking"],
    researcher: ["nested-agents", "principle-progress-tracking", "researching-codebases", "systems-thinking"],
    "security-reviewer": ["code-review", "conventional-comments", "nested-agents", "principle-progress-tracking", "reviewing-security"],
    "structure-planner": ["principle-progress-tracking", "product-thinking", "slicing-work", "systems-thinking"],
    "technical-writer": ["code-review", "conventional-comments", "principle-progress-tracking", "reviewing-documentation", "writing-prose"],
    "test-architect": ["principle-progress-tracking", "test-first-development"],
    "ux-reviewer": ["code-review", "principle-progress-tracking", "verifying-ux"],
    verifier: ["principle-progress-tracking", "running-quality-checks"],
  };

  for (const [agent, expected] of Object.entries(EXPECTED_PRELOADS)) {
    test(`${agent} preloads exactly: ${expected.join(", ")}`, () => {
      expect(preloads(agentPath(agent))).toEqual(expected);
    });
  }
});

describe("thin agents: the principle-* preload claim", () => {
  // docs/architecture.md and AGENTS.md both asserted that principle skills are
  // "preloaded by none, so they cost nothing against the load limit". Twelve of
  // the thirteen agents contradict that on disk: they preload
  // principle-progress-tracking. The true claim is narrower, and these three
  // assertions pin it so the corrected sentence cannot drift back.

  // The complete set of principle-* skills any agent may preload. A second
  // name here is a DECISION about the preload budget — every preloaded skill
  // spends context on every run of that agent — never a bookkeeping update.
  const PRINCIPLE_PRELOAD_UNION = ["principle-progress-tracking"];

  function principlePreloads(agent: string): string[] {
    return preloads(agentPath(agent)).filter((name) => name.startsWith("principle-"));
  }

  // Agents preloading a principle skill outside the pinned union, one line
  // each, so a single run names every offender.
  function agentsPreloadingOutsideUnion(): string[] {
    return ALL_AGENTS.flatMap((agent) => {
      const extra = principlePreloads(agent).filter(
        (name) => !PRINCIPLE_PRELOAD_UNION.includes(name),
      );
      return extra.length === 0 ? [] : [`${agent}: ${extra.join(", ")}`];
    });
  }

  test("each agent's principle-* preload set is a subset of the pinned union", () => {
    // Subset, not equality: agents/file-finder.md declares `skills:
    // [finding-files]` and preloads no principle skill at all, which is legal.
    expect(agentsPreloadingOutsideUnion()).toEqual([]);
  });

  test("the union across all 13 agents equals the pinned set", () => {
    // The half the subset check cannot give: empty preload lists everywhere
    // would satisfy "subset" while making the claim vacuous.
    expect(ALL_AGENTS.length).toBe(13);
    const union = [...new Set(ALL_AGENTS.flatMap(principlePreloads))].sort();
    expect(union).toEqual(PRINCIPLE_PRELOAD_UNION);
  });

  test("neither docs/architecture.md nor AGENTS.md still claims no agent preloads one", () => {
    // Both surfaces in one test on purpose: fixing one copy and leaving the
    // other is the failure mode, and it must stay red until both are true.
    const architecture = read(join(REPO_ROOT, "docs", "architecture.md"));
    const agents = read(join(REPO_ROOT, "AGENTS.md"));
    // Guard: a missing or renamed file must fail here, not pass the absence
    // checks vacuously.
    expect(architecture.length).toBeGreaterThan(0);
    expect(agents.length).toBeGreaterThan(0);

    expect(architecture).not.toContain("No agent preloads one");
    expect(agents).not.toContain("preloaded by none");
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
    const codeReview = readOrEmpty(skillPath("code-review"));
    expect(codeReview).toContain("reviewing-security/SKILL.md");
  });

  test("code-review absorbs the code-reviewer inspection checklist (off-by-one)", () => {
    expect(readOrEmpty(skillPath("code-review"))).toContain("off-by-one");
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

  test("docs/skills.md documents every skill: ### entry count equals the on-disk count", () => {
    // Every per-skill entry in docs/skills.md is an h3; nothing else in the
    // file uses that level. A drift here means an entry was added or lost
    // without the catalog (or the filesystem) following.
    const entries = read(SKILLS_MD).match(/^### /gm) ?? [];
    const count = readdirSync(join(REPO_ROOT, "skills")).filter((name) =>
      existsSync(join(REPO_ROOT, "skills", name, "SKILL.md")),
    ).length;
    expect(entries.length).toBe(count);
  });

  test("docs/architecture.md exempts own-procedure skills from the 3-skill soft limit", () => {
    const content = squash(read(ARCHITECTURE_MD));
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
    "eng-design-doc-review-planted-missing-alternatives": ["skills/documenting-decisions/**", "skills/technical-design-doc/**"],
  };

  const FIXTURE_INPUTS: Record<string, string> = {
    "team-question-neutral-questions": "evals/fixtures/team-question/neutral-questions/input.md",
    "team-design-seeded-research-and-task": "evals/fixtures/team-design/seeded-research-and-task/input.md",
    "team-research-answers-seeded-questions": "evals/fixtures/team-research/answers-seeded-questions/input.md",
    "team-structure-seeded-design": "evals/fixtures/team-structure/seeded-design/input.md",
    "team-plan-seeded-structure": "evals/fixtures/team-plan/seeded-structure/input.md",
    "eng-design-doc-review-planted-missing-alternatives": "evals/fixtures/eng-design-doc-review/planted-missing-alternatives/input.md",
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
