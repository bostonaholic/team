import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, "skills");
const AGENTS_DIR = join(REPO_ROOT, "agents");

const skill = (name: string) => join(SKILLS_DIR, name, "SKILL.md");
const agent = (name: string) => join(AGENTS_DIR, `${name}.md`);

// Read a file, returning "" when it does not exist yet. This keeps tests for
// not-yet-created files (e.g. the new progress-tracking skill) failing on a
// clean assertion rather than crashing with ENOENT.
const readOrEmpty = (path: string): string => (existsSync(path) ? read(path) : "");

// Canonical reference sentence inner text (from plan.md). Slices 2 and 3
// copy this byte-for-byte as a blockquote; the drift guard asserts a single
// unique variant across the repo.
const CANONICAL_INNER =
  "when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.";

// The 8 entry-point skills that must reference the convention (Slice 2).
const ENTRY_POINT_SKILLS = [
  "team-question",
  "team-research",
  "team-design",
  "team-structure",
  "team-plan",
  "team-worktree",
  "team-pr",
  "eng-design-doc-review",
];

// The 3 methodology procedure skills that must reference it (Slice 3).
const METHODOLOGY_SKILLS = [
  "test-driven-bug-fix",
  "systematic-debugging",
  "test-first-development",
];

// The 3 existing seeders that get an additive pointer (Slice 4).
const SEEDER_SKILLS = ["team", "team-fix", "team-implement"];

// The 12 multi-step agents that must preload progress-tracking (Slices 5+6).
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
  "writing-prose",
];

// True if a SKILL.md's frontmatter `skills:` array contains `progress-tracking`.
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
      if (/^\s*-\s+progress-tracking\s*$/.test(line)) return true;
      // Leaving the list once a non-indented, non-list-item line appears.
      if (!/^\s*-\s+/.test(line) && line.trim() !== "") break;
    }
  }
  return false;
}

// True if an agent's frontmatter `tools:` line grants the TodoWrite tool, so
// the preloaded progress-tracking convention is actually executable.
function toolsLineHasTodoWrite(text: string): boolean {
  return /^tools:.*\bTodoWrite\b/m.test(frontmatter(text));
}

describe("Slice 1: progress-tracking convention skill exists", () => {
  const PT = skill("progress-tracking");

  test("skills/progress-tracking/SKILL.md exists", () => {
    expect(existsSync(PT)).toBe(true);
  });

  test("progress-tracking opens with --- frontmatter", () => {
    expect(/^---\n/.test(readOrEmpty(PT))).toBe(true);
  });

  test("progress-tracking frontmatter declares name: progress-tracking", () => {
    const fm = frontmatter(readOrEmpty(PT));
    expect(/^name:\s*progress-tracking\s*$/m.test(fm)).toBe(true);
  });

  test("progress-tracking frontmatter has a non-empty description", () => {
    const fm = frontmatter(readOrEmpty(PT));
    expect(/^description:\s*\S/m.test(fm)).toBe(true);
  });

  test("progress-tracking frontmatter omits argument-hint", () => {
    // Bundles existence so a missing file fails here rather than passing
    // vacuously against empty text (the field is genuinely absent only once
    // the file is authored without it).
    const fm = frontmatter(readOrEmpty(PT));
    const present = existsSync(PT);
    const lacksArgHint = !/^argument-hint:/m.test(fm);
    expect(present && lacksArgHint).toBe(true);
  });

  test("progress-tracking body opens with the 'A convention, not a gate' role marker", () => {
    expect(readOrEmpty(PT)).toContain("A convention, not a gate");
  });

  test("progress-tracking cross-links qrspi-workflow", () => {
    expect(readOrEmpty(PT)).toContain("qrspi-workflow");
  });
});

describe("skill count reconciliation (-> 40: + slicing-work, planning-implementation)", () => {
  const CLAUDE_MD = join(REPO_ROOT, "CLAUDE.md");
  const AGENTS_MD = join(REPO_ROOT, "AGENTS.md");

  test("CLAUDE.md heading reads '## Skills (40)'", () => {
    expect(/^## Skills \(40\)/m.test(read(CLAUDE_MD))).toBe(true);
  });

  test("AGENTS.md heading reads '## Skills (40)'", () => {
    expect(/^## Skills \(40\)/m.test(read(AGENTS_MD))).toBe(true);
  });

  test("filesystem has exactly 40 SKILL.md files declaring a name:", () => {
    // 38 prior skills + slicing-work + planning-implementation = 40.
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(SKILLS_DIR, d.name, "SKILL.md"))
      .filter((p) => existsSync(p));
    const withName = dirs.filter((p) => /^name:/m.test(read(p)));
    expect(withName.length).toBe(40);
  });
});

describe("Slice 2: entry-point skills reference progress-tracking", () => {
  for (const name of ENTRY_POINT_SKILLS) {
    test(`${name} references skills/progress-tracking/SKILL.md`, () => {
      expect(read(skill(name))).toContain("skills/progress-tracking/SKILL.md");
    });
  }
});

describe("Slice 3: methodology procedure skills reference progress-tracking", () => {
  for (const name of METHODOLOGY_SKILLS) {
    test(`${name} references skills/progress-tracking/SKILL.md`, () => {
      expect(read(skill(name))).toContain("skills/progress-tracking/SKILL.md");
    });
  }
});

describe("Slices 2-3: canonical reference sentence is byte-identical (drift guard)", () => {
  test("exactly one unique variant of the canonical sentence exists across all entry-point + methodology skills", () => {
    const targets = [...ENTRY_POINT_SKILLS, ...METHODOLOGY_SKILLS];
    const variants = new Set<string>();
    for (const name of targets) {
      const lines = read(skill(name)).split("\n");
      for (const line of lines) {
        if (line.includes(CANONICAL_INNER)) variants.add(line.trim());
      }
    }
    // Exactly one distinct variant: the sentence is present across the
    // targets and never drifts into a second wording. (size 0 — absent —
    // also fails, so this requires presence as a side effect.)
    expect(variants.size).toBe(1);
  });
});

describe("Slice 4: existing seeders cross-reference progress-tracking", () => {
  for (const name of SEEDER_SKILLS) {
    test(`${name} contains a pointer to skills/progress-tracking/SKILL.md`, () => {
      expect(read(skill(name))).toContain("skills/progress-tracking/SKILL.md");
    });
  }

  test("team seed wording is unchanged ('Seed the TodoWrite ledger')", () => {
    expect(read(skill("team"))).toContain("Seed the TodoWrite ledger");
  });

  test("team-fix seed wording is unchanged ('Seed the TodoWrite ledger')", () => {
    expect(read(skill("team-fix"))).toContain("Seed the TodoWrite ledger");
  });

  test("team-implement seed wording is unchanged ('Coordinate progress via TodoWrite. Seed:')", () => {
    expect(read(skill("team-implement"))).toContain(
      "Coordinate progress via TodoWrite. Seed:",
    );
  });
});

describe("Slices 5-6: multi-step agents preload progress-tracking", () => {
  for (const name of PRELOAD_AGENTS) {
    test(`${name} skills: frontmatter contains progress-tracking`, () => {
      expect(skillsArrayHasProgressTracking(read(agent(name)))).toBe(true);
    });
  }

  test("file-finder does NOT preload progress-tracking", () => {
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
    test(`${name} does NOT reference progress-tracking`, () => {
      expect(read(skill(name))).not.toContain("progress-tracking");
    });
  }
});
