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
// separate front-door entry-point skill beside it. The reviewer procedures
// moved off the methodology list into ordinary references owned by their
// entry points, so no skill needs that escape hatch for them.

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
    expect(entries.length).toBe(25);
    expect(entries.filter((e) => e.section === METHODOLOGY_SECTION).length).toBe(0);
    expect(entries.filter((e) => COMMAND_SECTIONS.includes(e.section)).length).toBe(25);
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
  // violation, not pass because the predicate never fires. A command filed
  // under Methodology is the violation the rule exists to catch — a command
  // is not model-only.
  test("the sweep can see a violation", () => {
    const planted: Entry[] = [{ name: "team", section: METHODOLOGY_SECTION }];
    expect(planted.filter((e) => !isModelOnly(e.name)).map((e) => e.name)).toEqual(["team"]);
    const inverted: Entry[] = [{ name: "team", section: "## Standalone utilities" }];
    expect(inverted.filter((e) => isModelOnly(e.name)).map((e) => e.name)).toEqual([]);
  });

  // The reviewer briefs moved off the methodology list into ordinary reference
  // files owned by their entry points. The command stays; the brief is no
  // longer a skill.
  test("code-review owns the reviewer brief as an ordinary reference", () => {
    expect(isModelOnly("code-review")).toBe(false);
    expect(existsSync(join(REPO_ROOT, "skills", "reviewing-code", "SKILL.md"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "skills", "code-review", "references", "code-reviewer.md"))).toBe(true);
    const sectionOf = (n: string) => entries.find((e) => e.name === n)?.section;
    expect(COMMAND_SECTIONS).toContain(sectionOf("code-review") as string);
  });
});

// ---------------------------------------------------------------------------
// The reviewer briefs are ordinary reference files owned by their entry points,
// so no skill is both a methodology and a slash command. Three classifiers have to
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
        // Equal is the disagreement: every command carries `argument-hint`, which
        // `docs/architecture.md` uses as the flavor sorter.
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
    expect(directories.length).toBeGreaterThan(20);
    expect(entries.length).toBeGreaterThan(20);
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
    const miscatalogued: Entry[] = [{ name: "team", section: METHODOLOGY_SECTION }];
    expect(classifierDisagreements(miscatalogued)).toEqual([
      "team: section=## Methodology skills user-invocable-false=false argument-hint=true",
    ]);

    const phantom: Entry[] = [{ name: "no-such-skill", section: METHODOLOGY_SECTION }];
    expect(phantomEntries(phantom, directories)).toEqual(["no-such-skill"]);

    expect(uncataloguedDirectories([], ["running-quality-checks"])).toEqual(["running-quality-checks"]);

    const twice: Entry[] = [
      { name: "running-quality-checks", section: METHODOLOGY_SECTION },
      { name: "running-quality-checks", section: METHODOLOGY_SECTION },
    ];
    expect(duplicateEntries(twice)).toEqual(["running-quality-checks"]);

    const misfiled: Entry[] = [{ name: "running-quality-checks", section: "## Something else" }];
    expect(unknownSectionEntries(misfiled)).toEqual(["running-quality-checks (## Something else)"]);
  });

  // The design reviewer brief moved off the methodology list into an ordinary
  // reference file owned by the eng-design-doc-review entry point.
  test("eng-design-doc-review owns the design reviewer brief as an ordinary reference", () => {
    // existsSync first so a missing file fails as an assertion, never ENOENT.
    expect(existsSync(join(REPO_ROOT, "skills", "reviewing-designs", "SKILL.md"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "skills", "eng-design-doc-review", "references", "design-reviewer.md"))).toBe(true);
    expect(isModelOnly("eng-design-doc-review")).toBe(false);
    const sectionOf = (name: string) => entries.find((entry) => entry.name === name)?.section;
    expect(COMMAND_SECTIONS).toContain(sectionOf("eng-design-doc-review") as string);
  });
});
