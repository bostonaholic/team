// L2 static-invariant tripwire: every `docs/skills.md` entry matches disk.
//
// The page is hand-authored, and nothing has ever pinned it to the skills it
// catalogues. This holds four properties per entry — shape, sentence, load
// set, load order — so a rewritten `description`, or a Skill-tool load added
// to any `.md` under `skills/<name>/`, reds the build with a message naming
// the skill, the name, and the direction.
//
// WHY LOADS AND NOT MENTIONS. The page's edges are the skill-to-skill
// dependency graph: A loads B loads C, read transitively. Only the load form
// — ``Call the Skill tool with `<name>` `` — is an edge, because only it sends
// the reader to go execute that skill. Every other way of naming a skill is a
// citation, and a citation carries no direction: a skill that restates a rule
// from `why` does not depend on `why`, and counting that as an edge invents a
// back-edge the graph does not have. `loadedSkills()` in
// tests/helpers/skill-refs.ts owns the extraction, so the page and
// tests/skill-tool-invocation.test.ts read the same edges.
//
// WHY THE SENTENCE EQUALITY IS NOT A WORDING PIN. docs/testing.md, under "A
// tripwire asserts a contract, never a wording", sets the test: "if a rewrite
// that preserves the meaning turns the test red, the test was measuring the
// wording." This assertion passes it. The page holds no
// wording of its own here — the entry sentence is a *copy* of the first
// sentence of that skill's frontmatter `description`. A meaning-preserving
// rewrite of the description updates both copies in the same commit and stays
// green. The check reds only when the two copies disagree, which is drift
// between an artifact and its source, the "collision / drift tripwire" form
// docs/testing.md sanctions at L2. Same treatment as the recorded exception at
// SKILL_BUDGET_REASONS in tests/skill-budget.test.ts.

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { description, read, squash } from "./helpers/text";
import { loadedSkills, skillNames } from "./helpers/skill-refs";

const REPO_ROOT = join(import.meta.dir, "..");
const CATALOG = join(REPO_ROOT, "docs", "skills.md");
const SKILLS_ROOT = join(REPO_ROOT, "skills");

const LOADS_HEADER = "**Loads:**";
const LOAD_BULLET = /^- `([a-z0-9-]+)`$/;

type Entry = { name: string; section: string; body: string[] };

// ---------------------------------------------------------------------------
// Parse and file walk. Scaffolding: no rule lives here.
// ---------------------------------------------------------------------------

/**
 * Every `### [<name>](…)` entry, tagged with the `## ` section above it and
 * carrying its body — every line after the heading up to the next `/^#{2,3} /`
 * or EOF, with blank (trimmed-empty) lines dropped. The heading line is never
 * part of the body, so it cannot leak into the sentence comparison. Same pass
 * as catalogEntries() in tests/methodology-not-user-invocable.test.ts.
 */
function catalogEntries(page: string): Entry[] {
  const out: Entry[] = [];
  let section = "";
  let current: Entry | undefined;
  for (const line of page.split("\n")) {
    if (/^#{2,3} /.test(line)) current = undefined;
    if (line.startsWith("## ")) section = line.trim();
    const heading = /^### \[([a-z0-9-]+)\]/.exec(line);
    if (heading) {
      current = { name: heading[1] as string, section, body: [] };
      out.push(current);
      continue;
    }
    if (current && line.trim() !== "") current.body.push(line);
  }
  return out;
}

/** Every `.md` file under `dir`, at any depth: references/ and prompt templates included. */
function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

/** The names on the entry's load bullets, in authored order. */
function loadBullets(body: string[]): string[] {
  return body.flatMap((line) => {
    const bullet = LOAD_BULLET.exec(line.trim());
    return bullet ? [bullet[1] as string] : [];
  });
}

/** True when the body carries the loads header. */
function hasLoadsHeader(body: string[]): boolean {
  return body.some((line) => line.trim() === LOADS_HEADER);
}

/** A body line that is neither the loads header nor a load bullet. */
function isProse(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== LOADS_HEADER && !LOAD_BULLET.test(trimmed);
}

// ---------------------------------------------------------------------------
// The four page-side rules and the scanner, factored as pure functions so the
// planted-positive test runs the same code the real sweep runs
// (the offender rules in tests/methodology-not-user-invocable.test.ts).
// ---------------------------------------------------------------------------

/**
 * Shape offenders for one entry body, each naming the offending line. The body
 * must be one or more prose lines, then optionally the loads header followed
 * by one or more load bullets, and nothing after. Eight offenders: (1) zero
 * prose lines; (2) a line starting `- ` that is not exactly a load bullet
 * (a surviving `**Purpose:**` bullet, a trailing clause after a name); (3) a
 * prose line after the loads header; (4) a loads header with no bullet
 * under it; (5) a load bullet with no header above it; (6) a second loads
 * header; (7) a duplicate name among the bullets; (8) any body line with
 * leading whitespace, first line included.
 */
function shape(body: string[]): string[] {
  const offenders: string[] = [];
  const seen = new Set<string>();
  let headers = 0;
  let prose = 0;
  let bullets = 0;

  for (const line of body) {
    const trimmed = line.trim();
    if (line !== trimmed) offenders.push(`indented body line: ${JSON.stringify(line)}`);

    if (trimmed === LOADS_HEADER) {
      headers++;
      if (headers > 1) offenders.push("second loads header");
      continue;
    }

    const bullet = LOAD_BULLET.exec(trimmed);
    if (bullet) {
      const name = bullet[1] as string;
      bullets++;
      if (headers === 0) offenders.push(`load bullet with no header above it: ${name}`);
      if (seen.has(name)) offenders.push(`duplicate load: ${name}`);
      seen.add(name);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      offenders.push(`bullet that is not a bare load: ${JSON.stringify(trimmed)}`);
      continue;
    }

    prose++;
    if (headers > 0) offenders.push(`prose line after the loads header: ${JSON.stringify(trimmed)}`);
  }

  if (prose === 0) offenders.push("no prose line");
  if (headers > 0 && bullets === 0) offenders.push("loads header with no bullet under it");
  return offenders;
}

/**
 * Sentence offenders for one entry. Cut `description` at the first period
 * followed by whitespace, or at a period ending the string; join the body's
 * prose lines with a space; run squash() then .trim() over BOTH sides; compare.
 * A missing/empty description and a description with no sentence terminator are
 * each a named offender — no skip, no vacuous pass.
 */
function sentence(body: string[], description: string): string[] {
  const value = description.trim();
  if (value === "") return ["description is missing or empty"];

  const cut = /^[\s\S]*?\.(?=\s|$)/.exec(value);
  if (!cut) return [`description has no sentence terminator: ${JSON.stringify(value)}`];

  const expected = squash(cut[0]).trim();
  const actual = squash(body.filter(isProse).join(" ")).trim();

  return actual === expected
    ? []
    : [`sentence is ${JSON.stringify(actual)}, description's first sentence is ${JSON.stringify(expected)}`];
}

/**
 * Load-set offenders, each naming the offending name: a derived name missing
 * from the bullets, a listed name absent from the derived set, and a listed name
 * that is not a real skill at all. The second one is the direction check — a
 * skill that only *names* another skill has no edge to it, so listing it here
 * would draw an arrow the source never authorized.
 */
function loadSet(bullets: string[], derived: Set<string>, names: Set<string>): string[] {
  const listed = new Set(bullets);
  return [
    ...[...derived].filter((name) => !listed.has(name)).map((name) => `loads omit ${name}`),
    ...bullets.filter((name) => !derived.has(name)).map((name) => `loads list ${name}, which its files never load`),
    ...bullets.filter((name) => !names.has(name)).map((name) => `loads list ${name}, which is not a skill`),
  ];
}

/**
 * Order offenders: the authored bullet names compared to that same array under
 * `[...names].sort()` — codepoint order, so `pr-verify` precedes
 * `principle-fail-closed`. Names the first name out of place.
 */
function loadOrder(bullets: string[]): string[] {
  const sorted = [...bullets].sort();
  const at = bullets.findIndex((name, index) => name !== sorted[index]);
  return at === -1 ? [] : [`loads out of order at ${bullets[at]}, expected ${sorted[at]}`];
}

/**
 * The skills `text` instructs a load of, excluding `self` and filtered by
 * `names`. Delegates the extraction to loadedSkills(), so this page and
 * tests/skill-tool-invocation.test.ts can never disagree about what an edge is.
 * Pure over file text — the file walk stays outside, so the fixture needs no
 * disk layout.
 */
function deriveLoads(text: string, self: string, names: Set<string>): Set<string> {
  return new Set(loadedSkills(text).filter((name) => name !== self && names.has(name)));
}

/**
 * The skill names `text` NAMES, by either reference form: a bare backticked
 * lowercase-kebab token, or the path `skills/<x>/SKILL.md`. This is the old,
 * wider relation, and it exists here for exactly one purpose — the
 * discrimination guard below, which proves the load extractor is narrower than
 * it. Nothing on the page is derived from it.
 */
function namedSkills(text: string, self: string, names: Set<string>): Set<string> {
  const patterns = [/`([a-z0-9][a-z0-9-]*)`/g, /skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md/g];
  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1] as string;
      if (name !== self && names.has(name)) found.add(name);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Read once at module scope: the page, plus every `.md` file under skills/
// (skillContents and agentContents in tests/methodology.test.ts).
// ---------------------------------------------------------------------------

const ENTRIES = catalogEntries(read(CATALOG));
const ENTRY_BY_NAME = new Map(ENTRIES.map((entry) => [entry.name, entry]));
const NAMES = skillNames(REPO_ROOT);
const SKILL_DIRECTORIES = [...NAMES].sort();
const SKILL_MD_TEXT = new Map(
  SKILL_DIRECTORIES.map((name) => [name, read(join(SKILLS_ROOT, name, "SKILL.md"))]),
);
const ALL_MD_TEXT = new Map(
  SKILL_DIRECTORIES.map((name) => [
    name,
    markdownFiles(join(SKILLS_ROOT, name)).map(read).join("\n"),
  ]),
);

/** `owner -> loaded` edges over a name→text map. */
function edgeSet(texts: Map<string, string>): Set<string> {
  return new Set(
    [...texts].flatMap(([owner, text]) =>
      [...deriveLoads(text, owner, NAMES)].map((name) => `${owner} -> ${name}`),
    ),
  );
}

// Sweep glue: run one rule over one skill and prefix each offender with the
// skill, so the failure output names it.
const bodyOf = (name: string): string[] => ENTRY_BY_NAME.get(name)?.body ?? [];

const shapeOffenders = (name: string): string[] =>
  shape(bodyOf(name)).map((offender) => `${name}: ${offender}`);

const sentenceOffenders = (name: string): string[] =>
  sentence(bodyOf(name), description(SKILL_MD_TEXT.get(name) ?? "")).map(
    (offender) => `${name}: ${offender}`,
  );

const loadSetOffenders = (name: string): string[] =>
  loadSet(
    loadBullets(bodyOf(name)),
    deriveLoads(ALL_MD_TEXT.get(name) ?? "", name, NAMES),
    NAMES,
  ).map((offender) => `${name}: ${offender}`);

const loadOrderOffenders = (name: string): string[] =>
  loadOrder(loadBullets(bodyOf(name))).map((offender) => `${name}: ${offender}`);

describe("docs/skills.md catalog matches the skills on disk", () => {
  test("every entry's shape, sentence, load set, and load order match disk", () => {
    // Seven vacuity guards. Each names the property that vanished, because a
    // mis-scoped haystack makes every sweep below pass for the wrong reason
    // (docs/testing.md, "Prove a negative check can find a positive").
    expect(SKILL_DIRECTORIES.length).toBeGreaterThan(60); // (1) skills/ tree parsed
    expect(ENTRIES.length).toBeGreaterThan(60); // (2) page parsed
    expect(ENTRIES.filter((entry) => hasLoadsHeader(entry.body)).length).toBeGreaterThan(0); // (3)
    expect(ENTRIES.filter((entry) => !hasLoadsHeader(entry.body)).length).toBeGreaterThan(0); // (4)
    expect(ENTRIES.filter((entry) => entry.body.length === 0).map((entry) => entry.name)).toEqual(
      [],
    ); // (5) every parsed body non-empty

    // (6) Discrimination axis: a load is STRICTLY narrower than a mention. Every
    // load edge is also a mention edge, and dozens of mention edges are not load
    // edges — a `principle-*` citation, a "see also", a name in prose. An equal
    // pair means the extractor collapsed back into a name grep, which is exactly
    // the wrong relation: it would draw `b -> a` from `b` merely naming `a`.
    const allEdges = edgeSet(ALL_MD_TEXT);
    const namedEdges = new Set(
      [...ALL_MD_TEXT].flatMap(([owner, text]) =>
        [...namedSkills(text, owner, NAMES)].map((name) => `${owner} -> ${name}`),
      ),
    );
    expect([...allEdges].filter((edge) => !namedEdges.has(edge))).toEqual([]);
    expect(allEdges.size).toBeLessThan(namedEdges.size);

    // (7) Depth axis: the edge set over the SKILL.md files alone is a STRICT
    // subset of the set over every `.md` file. Dozens of edges live only in
    // references/ and the two prompt templates, so the margin is wide; an equal
    // pair means the walk shrank — a shallow glob or a missed references/
    // directory.
    const skillMdEdges = edgeSet(SKILL_MD_TEXT);
    expect([...skillMdEdges].filter((edge) => !allEdges.has(edge))).toEqual([]);
    expect(skillMdEdges.size).toBeLessThan(allEdges.size);

    // Every skill on disk has an entry. Fails loud rather than skipping.
    expect(SKILL_DIRECTORIES.filter((name) => !ENTRY_BY_NAME.has(name))).toEqual([]);

    // The four sweeps, over every entry.
    expect(SKILL_DIRECTORIES.flatMap(shapeOffenders)).toEqual([]);
    expect(SKILL_DIRECTORIES.flatMap(sentenceOffenders)).toEqual([]);
    expect(SKILL_DIRECTORIES.flatMap(loadSetOffenders)).toEqual([]);
    expect(SKILL_DIRECTORIES.flatMap(loadOrderOffenders)).toEqual([]);
  });

  test("the page-side rules each see a planted positive", () => {
    // A well-formed body, used as the negative control for every rule below.
    const clean = [
      "Lands a reviewed PR.",
      LOADS_HEADER,
      "- `pr-verify`",
      "- `principle-fail-closed`",
    ];
    expect(shape(clean)).toEqual([]);

    // Leftover bullet: a `**Purpose:**` line that survived the rewrite.
    expect(shape(["Lands a reviewed PR.", "- **Purpose:** Lands a reviewed PR."])).not.toEqual([]);

    // Second loads header.
    expect(shape([...clean, LOADS_HEADER, "- `shipit`"])).not.toEqual([]);

    // Trailing clause after a name.
    expect(
      shape(["Lands a reviewed PR.", LOADS_HEADER, "- `pr-verify` for the checks"]),
    ).not.toEqual([]);

    // Duplicate name among the bullets.
    expect(
      shape(["Lands a reviewed PR.", LOADS_HEADER, "- `pr-verify`", "- `pr-verify`"]),
    ).not.toEqual([]);

    // Indented line, as the first line and as a later line.
    expect(shape(["  Lands a reviewed PR."])).not.toEqual([]);
    expect(
      shape(["Lands a reviewed PR.", LOADS_HEADER, "- `pr-verify`", "  continued"]),
    ).not.toEqual([]);

    // Drifted sentence: the page no longer copies the description's first sentence.
    const description = "Lands a reviewed PR. Use on stated ship intent.";
    expect(sentence(["Lands a reviewed PR."], description)).toEqual([]);
    expect(sentence(["Lands a merged PR."], description)).not.toEqual([]);

    // Phantom name: a bullet naming no skill on disk.
    const derived = new Set(["pr-verify", "principle-fail-closed"]);
    expect(loadSet(["pr-verify", "principle-fail-closed"], derived, NAMES)).toEqual([]);
    expect(
      loadSet(["pr-verify", "principle-fail-closed", "not-a-skill"], derived, NAMES),
    ).not.toEqual([]);

    // Dropped name: a derived name the page omits.
    expect(loadSet(["pr-verify"], derived, NAMES)).not.toEqual([]);

    // Invented edge: a name the skill only mentions, listed as if it loaded it.
    // This is the direction rule — `b` naming `a` is not `b -> a`.
    expect(loadSet(["pr-verify", "principle-fail-closed", "shipit"], derived, NAMES)).not.toEqual(
      [],
    );

    // Correct set, wrong order. Codepoint sort: `pr-verify` precedes
    // `principle-fail-closed`, which a dictionary sort would reverse.
    expect(loadOrder(["pr-verify", "principle-fail-closed"])).toEqual([]);
    expect(loadOrder(["principle-fail-closed", "pr-verify"])).not.toEqual([]);
  });

  test("the scanner takes loads and leaves every other reference behind", () => {
    // A synthetic source standing in for one skill's `.md`, never a real skill
    // file. It carries all four reference shapes a body can hold: a load, a
    // path citation, a bare backticked name in ordinary prose, and the fixture
    // skill's own name. Only the load is an edge. Every name here is a real
    // skill directory, since the skillNames() filter would otherwise drop it
    // and hide a broken pattern.
    const fixture = [
      "# Fixture skill body",
      "",
      "Call the Skill tool with `pr-verify` before landing.",
      "The fail-closed rule is restated at skills/principle-fail-closed/SKILL.md.",
      "This is not a `git-commit`, and `shipit` never runs `not-a-real-skill`.",
    ].join("\n");

    expect([...deriveLoads(fixture, "shipit", NAMES)].sort()).toEqual(["pr-verify"]);

    // The wider relation over the same text, for contrast: three names, and
    // two of them are references the graph must not turn into edges.
    expect([...namedSkills(fixture, "shipit", NAMES)].sort()).toEqual([
      "git-commit",
      "pr-verify",
      "principle-fail-closed",
    ]);
  });
});
