// tests/skill-tool-invocation.test.ts
//
// L2 tripwire over every skill-to-skill LOAD reference in the distributed
// plugin. A load is written as a bare name (`Call the Skill tool with \`x\``)
// because that is the Skill tool's argument; a citation keeps its path. See
// docs/architecture.md, "Methodology skills", for the boundary.
//
// A bare name resolves to nothing on its own, so this file is what makes the
// load form checkable: every name a body reaches for must be a real skill.
// That is strictly stronger than the path assertions it replaces, which
// confirmed a string was present but never that its target existed — so
// `skills/git-commmit/SKILL.md` passed.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";
import { loadedSkills, skillNames } from "./helpers/skill-refs";

const REPO_ROOT = process.cwd();

const REQUIRED_LOADS_BY_COMPONENT: Record<string, readonly string[]> = {
  "skills/git-commit": ["writing-prose"],
  "skills/team-fix": [
    "tracking-tickets",
    "team-worktree",
    "worktree-isolation",
    "test-driven-bug-fix",
    "systematic-debugging",
  ],
  "skills/changelog": ["writing-prose"],
  "skills/decomposing-intent": ["product-requirements-doc"],
  "skills/code-review": ["reviewing-code"],
  "skills/reviewing-code": ["writing-prose", "review-severity-tiers", "test-style", "engineering-standards"],
  "skills/pr-verify": ["running-quality-checks"],
  "skills/implementing-slices": ["systematic-debugging", "git-commit"],
  "skills/product-requirements-doc": ["writing-prose"],
  "skills/team": [
    "tracking-tickets",
    "team-worktree",
    "cross-model-review",
    "reviewing-designs",
    "worktree-isolation",
    "running-quality-checks",
    "review-severity-tiers",
    "changelog",
    "team-pr",
  ],
  "skills/team-pr": ["tracking-tickets", "verifying-ux", "worktree-isolation", "changelog", "git-commit", "writing-prose"],
  "skills/technical-design-doc": ["writing-prose"],
  "skills/pr-rebase": ["running-quality-checks"],
  "skills/documenting-decisions": ["writing-prose"],
  "skills/pr-watch-as-author": ["tracking-tickets", "pr-open-comments"],
  "skills/authoring-designs": ["writing-prose", "systems-thinking"],
  "skills/test-driven-bug-fix": ["systematic-debugging"],
  "skills/eng-design-doc-review": ["writing-prose", "cross-model-review", "reviewing-designs"],
  "skills/reviewing-designs": [
    "technical-design-doc",
    "reviewing-code",
    "engineering-standards",
    "documenting-decisions",
    "cross-model-review",
    "conventional-comments",
    "writing-prose",
  ],
  "skills/team-implement": ["running-quality-checks", "review-severity-tiers", "team-pr"],
  "skills/team-design": ["cross-model-review", "reviewing-designs"],
  "skills/worktree-isolation": ["team-worktree"],
  "agents/code-reviewer.md": ["engineering-standards", "solid", "test-style", "systems-thinking"],
  "agents/test-architect.md": ["test-style"],
  "agents/ux-reviewer.md": ["systems-thinking"],
  "agents/questioner.md": ["product-thinking"],
  "agents/structure-planner.md": ["product-thinking", "systems-thinking"],
  "agents/planner.md": ["engineering-standards"],
  "agents/design-author.md": ["product-thinking"],
  "agents/implementer.md": ["engineering-standards", "solid", "refactoring-to-patterns", "systems-thinking"],
};

// Every distributed prose surface that can carry a load: the 13 agent bodies
// and every skill body. Dev tooling under .claude/ is out of scope — it ships
// to nobody.
function distributedBodies(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  for (const name of readdirSync(join(REPO_ROOT, "agents")).sort()) {
    if (name.endsWith(".md")) out.push({ rel: join("agents", name), text: read(join(REPO_ROOT, "agents", name)) });
  }
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      if (entry.isFile() && entry.name.endsWith(".md")) {
        out.push({ rel: path.slice(REPO_ROOT.length + 1), text: read(path) });
      }
    }
  };
  const skillsRoot = join(REPO_ROOT, "skills");
  if (existsSync(skillsRoot)) {
    visit(skillsRoot);
  }
  return out;
}

describe("Skill-tool loads resolve to real skills", () => {
  const bodies = distributedBodies();
  const valid = skillNames(REPO_ROOT);

  test("the sweep sees the whole plugin, not an empty haystack", () => {
    // Blindness guard. Without it, a broken extractor or a mis-scoped
    // directory read turns every check below into a green no-op and nothing
    // announces it (docs/testing.md, "Prove a negative check can find a
    // positive"). Floors, not exact counts: adding an agent or skill is
    // ordinary work and must not fail this.
    expect(bodies.length).toBeGreaterThan(60);
    expect(valid.size).toBeGreaterThan(50);
    const loading = bodies.filter((b) => loadedSkills(b.text).length > 0);
    expect(loading.length).toBeGreaterThan(20);
  });

  test("every loaded name is a skill that exists", () => {
    // The rename-and-typo check. A load names its target with no path, so
    // this is the only thing standing between a stale reference and a run
    // that silently proceeds without the skill it was told to load.
    const dangling: string[] = [];
    for (const { rel, text } of bodies) {
      for (const name of loadedSkills(text)) {
        if (!valid.has(name)) dangling.push(`${rel} -> ${name}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  test("no body loads itself", () => {
    // A skill that tells its reader to load the skill they are already
    // reading is a loop, and it reads as a real instruction.
    const selfLoads: string[] = [];
    for (const { rel, text } of bodies) {
      const own = rel.startsWith("skills/") ? rel.split("/")[1] : undefined;
      if (own && loadedSkills(text).includes(own)) selfLoads.push(rel);
    }
    expect(selfLoads).toEqual([]);
  });

  test("explicit cross-skill load contracts survive router splits", () => {
    const missing: string[] = [];
    for (const [component, required] of Object.entries(REQUIRED_LOADS_BY_COMPONENT)) {
      const prefix = `${component}/`;
      const actual = new Set(
        bodies
          .filter(({ rel }) => rel === component || rel.startsWith(prefix))
          .flatMap(({ text }) => loadedSkills(text)),
      );
      for (const name of required) {
        if (!actual.has(name)) missing.push(`${component} -> ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
