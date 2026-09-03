import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, "skills");
const AGENTS_DIR = join(REPO_ROOT, "agents");

const skill = (name: string) => join(SKILLS_DIR, name, "SKILL.md");
const agent = (name: string) => join(AGENTS_DIR, `${name}.md`);

// Read a file, returning "" when it does not exist yet. This keeps tests for
// not-yet-created files (e.g. the new principle-progress-tracking skill) failing on a
// clean assertion rather than crashing with ENOENT.
const readOrEmpty = (path: string): string => (existsSync(path) ? read(path) : "");

// The 10 entry-point skills that must reference the convention (Slice 2).
const ENTRY_POINT_SKILLS = [
  "team-question",
  "team-research",
  "team-design",
  "team-structure",
  "team-plan",
  "team-worktree",
  "team-pr",
  "eng-design-doc-review",
  "why",
  "how",
];

// The methodology procedure skills that must reference it.
const METHODOLOGY_SKILLS = [
  "test-driven-bug-fix",
  "systematic-debugging",
  "test-first-development",
  "reviewing-designs",
];

// The 3 existing seeders that get an additive pointer (Slice 4).
const SEEDER_SKILLS = ["team", "team-fix", "team-implement"];

// The 12 multi-step agents that must preload principle-progress-tracking (Slices 5+6).
const PRELOAD_AGENTS = [
  "questioner",
  "design-author",
  "structure-planner",
  "planner",
  "test-architect",
  "implementer",
  "code-reviewer",
  "security-reviewer",
  "ux-reviewer",
  "technical-writer",
  "researcher",
  "verifier",
];

// Skills explicitly out of scope — must NOT gain the reference.
const OUT_OF_SCOPE_SKILLS = [
  "product-thinking",
  "qrspi-workflow",
  "engineering-standards",
  "code-review",
  "reviewing-code",
  "writing-prose",
];

// True if a SKILL.md's frontmatter `skills:` array contains `principle-progress-tracking`.
function skillsArrayHasProgressTracking(text: string): boolean {
  const fm = frontmatter(text);
  const lines = fm.split("\n");
  let inSkills = false;
  for (const line of lines) {
    if (/^skills:\s*$/.test(line)) {
      inSkills = true;
      continue;
    }
    if (inSkills) {
      if (/^\s*-\s+principle-progress-tracking\s*$/.test(line)) return true;
      // Leaving the list once a non-indented, non-list-item line appears.
      if (!/^\s*-\s+/.test(line) && line.trim() !== "") break;
    }
  }
  return false;
}

// True if an agent's frontmatter `tools:` line grants the TodoWrite tool, so
// the preloaded principle-progress-tracking convention is actually executable.
function toolsLineHasTodoWrite(text: string): boolean {
  return /^tools:.*\bTodoWrite\b/m.test(frontmatter(text));
}

function usesProgressTracking(text: string): boolean {
  return /(?:Skill tool with `|skills\/)principle-progress-tracking/.test(text);
}

describe("Slice 1: principle-progress-tracking convention skill exists", () => {
  const PT = skill("principle-progress-tracking");

  test("skills/principle-progress-tracking/SKILL.md exists", () => {
    expect(existsSync(PT)).toBe(true);
  });

  test("principle-progress-tracking opens with --- frontmatter", () => {
    expect(/^---\n/.test(readOrEmpty(PT))).toBe(true);
  });

  test("principle-progress-tracking frontmatter declares name: principle-progress-tracking", () => {
    const fm = frontmatter(readOrEmpty(PT));
    expect(/^name:\s*principle-progress-tracking\s*$/m.test(fm)).toBe(true);
  });

  test("principle-progress-tracking frontmatter has a non-empty description", () => {
    const fm = frontmatter(readOrEmpty(PT));
    expect(/^description:\s*\S/m.test(fm)).toBe(true);
  });

  test("principle-progress-tracking frontmatter omits argument-hint", () => {
    // Bundles existence so a missing file fails here rather than passing
    // vacuously against empty text (the field is genuinely absent only once
    // the file is authored without it).
    const fm = frontmatter(readOrEmpty(PT));
    const present = existsSync(PT);
    const lacksArgHint = !/^argument-hint:/m.test(fm);
    expect(present && lacksArgHint).toBe(true);
  });

  test("principle-progress-tracking states the executable ledger contract", () => {
    const text = readOrEmpty(PT);
    expect(text).toContain("two or more ordered steps");
    expect(text).toMatch(/one item per\s+step/);
    expect(text).toContain("Seed every item before starting");
    expect(text).toContain("`in_progress`");
    expect(text).toContain("`completed`");
    expect(text).toContain("blocks nothing");
  });

  test("principle-progress-tracking cross-links qrspi-workflow", () => {
    expect(readOrEmpty(PT)).toContain("qrspi-workflow");
  });
});

describe("Slice 2: entry-point skills reference principle-progress-tracking", () => {
  for (const name of ENTRY_POINT_SKILLS) {
    test(`${name} loads principle-progress-tracking`, () => {
      expect(usesProgressTracking(read(skill(name)))).toBe(true);
    });
  }
});

describe("Slice 3: methodology procedure skills reference principle-progress-tracking", () => {
  for (const name of METHODOLOGY_SKILLS) {
    test(`${name} loads principle-progress-tracking`, () => {
      expect(usesProgressTracking(read(skill(name)))).toBe(true);
    });
  }
});

describe("Slice 4: existing seeders cross-reference principle-progress-tracking", () => {
  for (const name of SEEDER_SKILLS) {
    test(`${name} loads principle-progress-tracking`, () => {
      expect(usesProgressTracking(read(skill(name)))).toBe(true);
    });
  }

  test("team seeds all QRSPI phases in order", () => {
    expect(read(skill("team"))).toContain(
      "Worktree → Question → Research → Design → Structure → Plan → Implement → PR",
    );
  });

  test("team-fix seeds its complete workflow in order", () => {
    expect(read(skill("team-fix"))).toContain(
      "Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship",
    );
  });

  test("team-implement seeds its producer and review work in order", () => {
    expect(read(skill("team-implement"))).toContain(
      "Test-architect → Mechanical gate → Implementer (per slice) → Review round 1",
    );
  });
});

describe("Slices 5-6: multi-step agents preload principle-progress-tracking", () => {
  for (const name of PRELOAD_AGENTS) {
    test(`${name} skills: frontmatter contains principle-progress-tracking`, () => {
      expect(skillsArrayHasProgressTracking(read(agent(name)))).toBe(true);
    });
  }

  test("file-finder does NOT preload principle-progress-tracking", () => {
    expect(skillsArrayHasProgressTracking(read(agent("file-finder")))).toBe(false);
  });
});

describe("Slices 5-6: multi-step agents grant the TodoWrite tool", () => {
  for (const name of PRELOAD_AGENTS) {
    test(`${name} tools: frontmatter includes TodoWrite`, () => {
      expect(toolsLineHasTodoWrite(read(agent(name)))).toBe(true);
    });
  }

  test("file-finder does NOT grant TodoWrite", () => {
    expect(toolsLineHasTodoWrite(read(agent("file-finder")))).toBe(false);
  });
});

describe("Out of scope: pure reference / methodology skills are untouched", () => {
  for (const name of OUT_OF_SCOPE_SKILLS) {
    test(`${name} does NOT reference principle-progress-tracking`, () => {
      expect(read(skill(name))).not.toContain("principle-progress-tracking");
    });
  }
});

// ---------------------------------------------------------------------------
// The design-review brief lives in the `reviewing-designs` methodology skill,
// and it carries that skill's progress-tracking cite. The
// `eng-design-doc-review` entry point that dispatches the brief carries its
// own cite for the multi-step procedure it runs, which is why it is in
// ENTRY_POINT_SKILLS. `reviewing-designs` is in METHODOLOGY_SKILLS above,
// which puts both files under the byte-identity drift guard.
// ---------------------------------------------------------------------------

describe("both halves of the design review cite progress-tracking", () => {
  test("reviewing-designs loads the convention before its numbered process", () => {
    const text = readOrEmpty(skill("reviewing-designs"));
    expect(usesProgressTracking(text)).toBe(true);
    expect(text).toMatch(/1\. \*\*Locate the document\.\*\*/);
  });

  test("eng-design-doc-review loads the convention before dispatch", () => {
    const text = readOrEmpty(skill("eng-design-doc-review"));
    expect(usesProgressTracking(text)).toBe(true);
    expect(text).toMatch(/1\. Call the Skill tool with `cross-model-review`/);
  });
});
