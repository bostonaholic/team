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

import { existsSync, readdirSync, readFileSync } from "node:fs";
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

// ---------------------------------------------------------------------------
// The design-review brief lives in a `reviewing-designs` methodology skill so
// no skill is both a methodology and a slash command. Three classifiers have to
// agree for every skill, and the catalog has to be a total, duplicate-free map
// of what is on disk: a bare count comparison of entries against directories
// passes whenever a duplicate entry offsets a missing one.
// ---------------------------------------------------------------------------

/** Every `skills/<name>/SKILL.md` directory on disk, sorted. */
function skillDirectories(): string[] {
  return readdirSync(join(REPO_ROOT, "skills"))
    .filter((name) => existsSync(join(REPO_ROOT, "skills", name, "SKILL.md")))
    .sort();
}

/** True when the skill's frontmatter declares an `argument-hint`. */
function takesArguments(name: string): boolean {
  const path = join(REPO_ROOT, "skills", name, "SKILL.md");
  if (!existsSync(path)) return false;
  return /^argument-hint:/m.test(frontmatter(read(path)));
}

const KNOWN_SECTIONS = [METHODOLOGY_SECTION, ...COMMAND_SECTIONS];

// The four offender rules, factored so the planted-positive test can run each
// one against synthetic input instead of trusting that it fired on real data.

/**
 * Skills whose three flavor classifiers disagree. Catalog section,
 * `user-invocable: false`, and `argument-hint` are three claims about one
 * thing — who may reach the skill — so a methodology skill is catalogued as
 * one, hides from the slash menu, and takes no arguments, and a command is the
 * exact mirror.
 */
function classifierDisagreements(entries: Entry[]): string[] {
  return entries
    .filter((entry) => KNOWN_SECTIONS.includes(entry.section))
    .filter(
      (entry) =>
        (entry.section === METHODOLOGY_SECTION) !== isModelOnly(entry.name) ||
        isModelOnly(entry.name) === takesArguments(entry.name),
    )
    .map(
      (entry) =>
        `${entry.name}: section=${entry.section} user-invocable-false=${isModelOnly(entry.name)} argument-hint=${takesArguments(entry.name)}`,
    );
}

/** Catalog entries naming no skill directory on disk. */
function phantomEntries(entries: Entry[], directories: string[]): string[] {
  const onDisk = new Set(directories);
  return entries.filter((entry) => !onDisk.has(entry.name)).map((entry) => entry.name);
}

/** Skill directories with no catalog entry. */
function uncataloguedDirectories(entries: Entry[], directories: string[]): string[] {
  const catalogued = new Set(entries.map((entry) => entry.name));
  return directories.filter((name) => !catalogued.has(name));
}

/**
 * Names catalogued more than once. Uniqueness is what makes the two key-set
 * checks total: without it a duplicate entry stands in for a missing one and
 * both directions pass.
 */
function duplicateEntries(entries: Entry[]): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) counts.set(entry.name, (counts.get(entry.name) ?? 0) + 1);
  return [...counts].filter(([, count]) => count > 1).map(([name]) => name);
}

/** Entries filed under a `## ` section that classifies nothing. */
function unknownSectionEntries(entries: Entry[]): string[] {
  return entries
    .filter((entry) => !KNOWN_SECTIONS.includes(entry.section))
    .map((entry) => `${entry.name} (${entry.section})`);
}

describe("skill flavor and catalog completeness", () => {
  const entries = catalogEntries();
  const directories = skillDirectories();

  // Guard: a mis-parsed catalog or an unreadable skills/ tree would pass every
  // offender check below vacuously.
  test("the catalog and the skills directory both parse non-empty", () => {
    expect(directories.length).toBeGreaterThan(60);
    expect(entries.length).toBeGreaterThan(60);
  });

  test("the three flavor classifiers agree for every catalogued skill", () => {
    expect(classifierDisagreements(entries)).toEqual([]);
  });

  test("every skill directory on disk has a catalog entry", () => {
    expect(uncataloguedDirectories(entries, directories)).toEqual([]);
  });

  test("every catalog entry names a skill directory on disk", () => {
    expect(phantomEntries(entries, directories)).toEqual([]);
  });

  test("no skill is catalogued twice", () => {
    expect(duplicateEntries(entries)).toEqual([]);
  });

  test("every catalog entry sits under a known section", () => {
    expect(unknownSectionEntries(entries)).toEqual([]);
  });

  // Every per-skill entry is an h3 in the linked `### [<name>](…)` form, and
  // nothing else in the file uses that level. A plain `### ` heading would slip
  // past the parser above and out of every check here.
  test("every ### heading in the catalog is a parsed skill entry", () => {
    const headings = read(CATALOG).match(/^### /gm) ?? [];
    expect(entries.length).toBe(headings.length);
  });

  // Prove each rule can find a positive: four planted violations, one per way
  // the catalog can lie about what a skill is.
  test("the flavor and completeness checks can see planted violations", () => {
    const miscatalogued: Entry[] = [{ name: "reviewing-code", section: "## Standalone utilities" }];
    expect(classifierDisagreements(miscatalogued)).toEqual([
      "reviewing-code: section=## Standalone utilities user-invocable-false=true argument-hint=false",
    ]);

    const phantom: Entry[] = [{ name: "no-such-skill", section: METHODOLOGY_SECTION }];
    expect(phantomEntries(phantom, directories)).toEqual(["no-such-skill"]);

    expect(uncataloguedDirectories([], ["reviewing-code"])).toEqual(["reviewing-code"]);

    const twice: Entry[] = [
      { name: "reviewing-code", section: METHODOLOGY_SECTION },
      { name: "reviewing-code", section: METHODOLOGY_SECTION },
    ];
    expect(duplicateEntries(twice)).toEqual(["reviewing-code"]);

    const misfiled: Entry[] = [{ name: "reviewing-code", section: "## Something else" }];
    expect(unknownSectionEntries(misfiled)).toEqual(["reviewing-code (## Something else)"]);
  });

  // The second front-door pair, pinned the way the code-review / reviewing-code
  // pair is: the brief is the methodology, the slash command is its front door.
  test("the reviewing-designs / eng-design-doc-review pair models the front-door shape", () => {
    // existsSync first so a missing skill fails as an assertion, never ENOENT.
    expect(existsSync(join(REPO_ROOT, "skills", "reviewing-designs", "SKILL.md"))).toBe(true);
    expect(isModelOnly("reviewing-designs")).toBe(true);
    expect(isModelOnly("eng-design-doc-review")).toBe(false);
    const sectionOf = (name: string) => entries.find((entry) => entry.name === name)?.section;
    expect(sectionOf("reviewing-designs")).toBe(METHODOLOGY_SECTION);
    expect(COMMAND_SECTIONS).toContain(sectionOf("eng-design-doc-review") as string);
  });
});
