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

// Every distributed prose surface that can carry a load: the 13 agent bodies
// and every skill body. Dev tooling under .claude/ is out of scope — it ships
// to nobody.
function distributedBodies(): { rel: string; text: string }[] {
  const out: { rel: string; text: string }[] = [];
  for (const name of readdirSync(join(REPO_ROOT, "agents")).sort()) {
    if (name.endsWith(".md")) out.push({ rel: join("agents", name), text: read(join(REPO_ROOT, "agents", name)) });
  }
  const skillsRoot = join(REPO_ROOT, "skills");
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const file = join(skillsRoot, entry.name, "SKILL.md");
    if (existsSync(file)) out.push({ rel: join("skills", entry.name, "SKILL.md"), text: read(file) });
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
});
