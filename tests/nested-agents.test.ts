import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const AGENTS_DIR = join(REPO_ROOT, "agents");
const NESTED_SKILL = join(REPO_ROOT, "skills", "nested-agents", "SKILL.md");
const AOQ_SKILL = join(REPO_ROOT, "skills", "agent-open-questions", "SKILL.md");

const agent = (name: string) => join(AGENTS_DIR, `${name}.md`);
const readOrEmpty = (path: string): string => (existsSync(path) ? read(path) : "");

// Collapse all whitespace runs so prose wrapped + indented across lines can
// be matched as one string.
const flat = (text: string): string => text.replace(/\s+/g, " ");

// The exact allowlist of agents granted the Agent tool (nested sub-agent
// dispatch, Claude Code >= 2.1.172). This is the creep fence: any other agent
// gaining `Agent` must be a deliberate decision that updates this list.
const GRANTED = ["researcher", "implementer", "code-reviewer", "security-reviewer"];

// All agent names, discovered from the filesystem so a 14th agent cannot
// slip in ungoverned.
function allAgentNames(): string[] {
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

// True if an agent's frontmatter `tools:` line grants the Agent tool.
// Matches both the plain `Agent` and restricted `Agent(<type>)` forms.
function toolsLineHasAgent(text: string): boolean {
  return /^tools:.*\bAgent\b/m.test(frontmatter(text));
}

// True if a file's frontmatter `skills:` array contains `nested-agents`.
function skillsArrayHasNestedAgents(text: string): boolean {
  const fm = frontmatter(text);
  const lines = fm.split("\n");
  let inSkills = false;
  for (const line of lines) {
    if (/^skills:\s*$/.test(line)) {
      inSkills = true;
      continue;
    }
    if (inSkills) {
      if (/^\s*-\s+nested-agents\s*$/.test(line)) return true;
      if (!/^\s*-\s+/.test(line) && line.trim() !== "") break;
    }
  }
  return false;
}

describe("Agent-tool allowlist (exact, positive + negative)", () => {
  test("the agents/ directory holds exactly 13 agent files", () => {
    expect(allAgentNames().length).toBe(13);
  });

  test("every GRANTED name corresponds to an existing agent file", () => {
    for (const name of GRANTED) {
      expect(existsSync(agent(name))).toBe(true);
    }
  });

  for (const name of GRANTED) {
    test(`${name} tools: frontmatter includes Agent`, () => {
      expect(toolsLineHasAgent(read(agent(name)))).toBe(true);
    });
  }

  test("no agent outside the allowlist grants the Agent tool", () => {
    const offenders = allAgentNames()
      .filter((name) => !GRANTED.includes(name))
      .filter((name) => toolsLineHasAgent(read(agent(name))));
    expect(offenders).toEqual([]);
  });
});

describe("granted agents preload + reference the nested-agents skill", () => {
  for (const name of GRANTED) {
    test(`${name} skills: frontmatter contains nested-agents`, () => {
      expect(skillsArrayHasNestedAgents(read(agent(name)))).toBe(true);
    });

    test(`${name} body references skills/nested-agents/SKILL.md`, () => {
      expect(read(agent(name))).toContain("nested-agents/SKILL.md");
    });

    test(`${name} body has a nested-dispatch section (scout or skeptic)`, () => {
      expect(/^## .*(scout|skeptic)/im.test(read(agent(name)))).toBe(true);
    });
  }

  test("no agent outside the allowlist preloads nested-agents", () => {
    const offenders = allAgentNames()
      .filter((name) => !GRANTED.includes(name))
      .filter((name) => skillsArrayHasNestedAgents(read(agent(name))));
    expect(offenders).toEqual([]);
  });
});

describe("nested-agents skill structure and load-bearing rules", () => {
  test("skills/nested-agents/SKILL.md exists", () => {
    expect(existsSync(NESTED_SKILL)).toBe(true);
  });

  test("frontmatter declares name: nested-agents", () => {
    const fm = frontmatter(readOrEmpty(NESTED_SKILL));
    expect(/^name:\s*nested-agents\s*$/m.test(fm)).toBe(true);
  });

  test("frontmatter has a non-empty description", () => {
    const fm = frontmatter(readOrEmpty(NESTED_SKILL));
    expect(/^description:\s*\S/m.test(fm)).toBe(true);
  });

  test("frontmatter is exactly name + description + user-invocable: false (methodology convention)", () => {
    const fm = frontmatter(readOrEmpty(NESTED_SKILL));
    const keys = fm
      .split("\n")
      .filter((line) => /^[A-Za-z][\w-]*:/.test(line))
      .map((line) => line.split(":")[0]);
    expect(keys.sort()).toEqual(["description", "name", "user-invocable"]);
    expect(/^user-invocable:\s*false\s*$/m.test(fm)).toBe(true);
  });

  test("body states the depth budget", () => {
    const text = readOrEmpty(NESTED_SKILL);
    expect(text).toContain("depth 2 of 5");
    expect(/ONE more level/i.test(text)).toBe(true);
  });

  test("body forbids nested helpers from emitting openQuestions envelopes", () => {
    // Any-occurrence ±5-line window around openQuestions must carry a
    // prohibition (never / must not).
    const lines = readOrEmpty(NESTED_SKILL).split("\n");
    let windows = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line !== undefined && /openQuestions/.test(line)) {
        const start = Math.max(0, i - 5);
        windows += lines.slice(start, i + 6).join("\n") + "\n";
      }
    }
    expect(windows.length).toBeGreaterThan(0);
    expect(/never|must not/i.test(windows)).toBe(true);
  });

  test("body mandates graceful degradation (inline fallback)", () => {
    const text = flat(readOrEmpty(NESTED_SKILL));
    expect(text).toContain("do the work yourself inline");
    expect(/unavailable/i.test(text)).toBe(true);
  });

  test("body caps concurrent helpers at 4", () => {
    expect(readOrEmpty(NESTED_SKILL)).toContain("4 helpers");
  });

  test("body defaults nested helpers to read-only and bans artifact writes", () => {
    const text = readOrEmpty(NESTED_SKILL);
    expect(/read-only/i.test(text)).toBe(true);
    expect(text).toContain("docs/plans/");
  });

  test("body requires neutral claims for verification helpers", () => {
    const text = readOrEmpty(NESTED_SKILL);
    expect(/neutral/i.test(text)).toBe(true);
    expect(/refute/i.test(text)).toBe(true);
  });
});

describe("agent-open-questions skill forbids envelopes from nested helpers", () => {
  test("contains a nested sub-agents prohibition section", () => {
    expect(/^## Nested sub-agents/im.test(read(AOQ_SKILL))).toBe(true);
  });

  test("prohibition states MUST NOT emit and cross-links nested-agents", () => {
    const text = read(AOQ_SKILL);
    expect(text).toContain("MUST NOT emit");
    expect(text).toContain("nested-agents");
  });
});

describe("skeptic pass safety pins (protects true-positive detection)", () => {
  for (const name of ["code-reviewer", "security-reviewer"]) {
    test(`${name} pins the default-keep rule`, () => {
      expect(/default-keep/i.test(read(agent(name)))).toBe(true);
    });

    test(`${name} states the pass must never remove a true positive`, () => {
      expect(flat(read(agent(name)))).toContain("never remove a true positive");
    });
  }
});
