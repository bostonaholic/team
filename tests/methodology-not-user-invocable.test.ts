// L2 tripwire: no methodology skill is user-invocable, and no command is a
// methodology skill.
//
// `docs/skills.md` states the rule — methodology skills are never invoked
// directly — and it shipped for a long time with an exception attached to
// `code-review`, which was a methodology four agents preload *and* a slash
// command. Removing the exception is only durable if the next skill cannot
// recreate it, and the authoring guide's prose cannot fail a build.
//
// The catalog is the classifier. A skill's `###` entry in `docs/skills.md`
// sits under exactly one `## ` section, and that placement is the claim about
// what the skill is; `user-invocable: false` in its frontmatter is the claim
// about who may reach it. This asserts the two agree, in both directions:
//
//   - every skill catalogued under `## Methodology skills` sets the field
//   - no skill catalogued under a command section sets it
//
// The escape hatch a methodology skill needs is not this flag — it is a
// separate front-door entry-point skill beside it (`reviewing-code` and
// `code-review` are the worked pair). That shape passes both directions.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = join(import.meta.dir, "..");
const CATALOG = join(REPO_ROOT, "docs", "skills.md");

const METHODOLOGY_SECTION = "## Methodology skills";
// Every other section that catalogues a skill a user can type.
const COMMAND_SECTIONS = ["## Entry-point skills", "## Standalone utilities"];

type Entry = { name: string; section: string };

/** Every `### [<name>](…)` catalog entry, tagged with the `## ` section above it. */
function catalogEntries(): Entry[] {
  const out: Entry[] = [];
  let section = "";
  for (const line of readFileSync(CATALOG, "utf8").split("\n")) {
    if (line.startsWith("## ")) section = line.trim();
    const m = /^### \[([a-z0-9-]+)\]/.exec(line);
    if (m) out.push({ name: m[1] as string, section });
  }
  return out;
}

/** True when the skill's frontmatter hides it from the slash menu. */
function isModelOnly(name: string): boolean {
  const path = join(REPO_ROOT, "skills", name, "SKILL.md");
  if (!existsSync(path)) return false;
  return /^user-invocable: false$/m.test(frontmatter(read(path)));
}

describe("methodology skills are never user-invocable", () => {
  const entries = catalogEntries();

  // Guard: an empty or mis-parsed catalog would pass every check below.
  test("the catalog parse sees both kinds of section", () => {
    expect(entries.length).toBeGreaterThan(60);
    expect(entries.filter((e) => e.section === METHODOLOGY_SECTION).length).toBeGreaterThan(40);
    expect(entries.filter((e) => COMMAND_SECTIONS.includes(e.section)).length).toBeGreaterThan(10);
  });

  test("every skill catalogued as methodology sets user-invocable: false", () => {
    const offenders = entries
      .filter((e) => e.section === METHODOLOGY_SECTION)
      .filter((e) => !isModelOnly(e.name))
      .map((e) => e.name);
    expect(offenders).toEqual([]);
  });

  test("no skill catalogued as a command sets user-invocable: false", () => {
    const offenders = entries
      .filter((e) => COMMAND_SECTIONS.includes(e.section))
      .filter((e) => isModelOnly(e.name))
      .map((e) => `${e.name} (${e.section})`);
    expect(offenders).toEqual([]);
  });

  // Prove the sweep can find a positive: the check must fail on a planted
  // violation, not pass because the predicate never fires.
  test("the sweep can see a violation", () => {
    const planted: Entry[] = [{ name: "reviewing-code", section: METHODOLOGY_SECTION }];
    expect(planted.filter((e) => !isModelOnly(e.name))).toEqual([]);
    const inverted: Entry[] = [{ name: "reviewing-code", section: "## Standalone utilities" }];
    expect(inverted.filter((e) => isModelOnly(e.name)).map((e) => e.name)).toEqual([
      "reviewing-code",
    ]);
  });

  // The front door is the sanctioned way a methodology gets a command. Pin the
  // worked pair so the guide's example cannot rot into a violation.
  test("the code-review / reviewing-code pair models the front-door shape", () => {
    expect(isModelOnly("reviewing-code")).toBe(true);
    expect(isModelOnly("code-review")).toBe(false);
    const sectionOf = (n: string) => entries.find((e) => e.name === n)?.section;
    expect(sectionOf("reviewing-code")).toBe(METHODOLOGY_SECTION);
    expect(COMMAND_SECTIONS).toContain(sectionOf("code-review") as string);
  });
});
