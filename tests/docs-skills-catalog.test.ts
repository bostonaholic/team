// L2 static-invariant tripwire: every `docs/skills.md` entry matches disk.
//
// The page is hand-authored, and nothing has ever pinned it to the skills it
// catalogues. This holds four properties per entry — shape, sentence, mention
// set, mention order — so a rewritten `description`, or a backticked skill name
// added to any `.md` under `skills/<name>/`, reds the build with a message
// naming the skill, the name, and the direction.
//
// WHY THE SENTENCE EQUALITY IS NOT A WORDING PIN. docs/testing.md:160-161 sets
// the test: "if a rewrite that preserves the meaning turns the test red, the
// test was measuring the wording." This assertion passes it. The page holds no
// wording of its own here — the entry sentence is a *copy* of the first
// sentence of that skill's frontmatter `description`. A meaning-preserving
// rewrite of the description updates both copies in the same commit and stays
// green. The check reds only when the two copies disagree, which is drift
// between an artifact and its source, the "collision / drift tripwire" form
// docs/testing.md sanctions at L2. Same treatment as the recorded exception at
// tests/skill-budget.test.ts:16-18.

import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { description, read, squash } from "./helpers/text";
import { skillNames } from "./helpers/skill-refs";

const REPO_ROOT = join(import.meta.dir, "..");
const CATALOG = join(REPO_ROOT, "docs", "skills.md");
const SKILLS_ROOT = join(REPO_ROOT, "skills");

const MENTIONS_HEADER = "**Mentions:**";
const MENTION_BULLET = /^- `([a-z0-9-]+)`$/;

type Entry = { name: string; section: string; body: string[] };

/** The two encoded skill-to-skill reference forms (docs/architecture.md#6-skills). */
type ReferenceForm = "bare" | "path";

const BOTH_FORMS: ReferenceForm[] = ["bare", "path"];

// ---------------------------------------------------------------------------
// Parse and file walk. Scaffolding: no rule lives here.
// ---------------------------------------------------------------------------

/**
 * Every `### [<name>](…)` entry, tagged with the `## ` section above it and
 * carrying its body — every line after the heading up to the next `/^#{2,3} /`
 * or EOF, with blank (trimmed-empty) lines dropped. The heading line is never
 * part of the body, so it cannot leak into the sentence comparison. Same pass
 * as tests/methodology-not-user-invocable.test.ts:38-47.
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

/** The names on the entry's mention bullets, in authored order. */
function mentionBullets(body: string[]): string[] {
  return body.flatMap((line) => {
    const bullet = MENTION_BULLET.exec(line.trim());
    return bullet ? [bullet[1] as string] : [];
  });
}

/** True when the body carries the mentions header. */
function hasMentionsHeader(body: string[]): boolean {
  return body.some((line) => line.trim() === MENTIONS_HEADER);
}

/** A body line that is neither the mentions header nor a mention bullet. */
function isProse(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== MENTIONS_HEADER && !MENTION_BULLET.test(trimmed);
}

// ---------------------------------------------------------------------------
// The four page-side rules and the scanner, factored as pure functions so the
// planted-positive test runs the same code the real sweep runs
// (tests/methodology-not-user-invocable.test.ts:128-182).
// ---------------------------------------------------------------------------

/**
 * Shape offenders for one entry body, each naming the offending line. The body
 * must be one or more prose lines, then optionally the mentions header followed
 * by one or more mention bullets, and nothing after. Eight offenders: (1) zero
 * prose lines; (2) a line starting `- ` that is not exactly a mention bullet
 * (a surviving `**Purpose:**` bullet, a trailing clause after a name); (3) a
 * prose line after the mentions header; (4) a mentions header with no bullet
 * under it; (5) a mention bullet with no header above it; (6) a second mentions
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

    if (trimmed === MENTIONS_HEADER) {
      headers++;
      if (headers > 1) offenders.push("second mentions header");
      continue;
    }

    const bullet = MENTION_BULLET.exec(trimmed);
    if (bullet) {
      const name = bullet[1] as string;
      bullets++;
      if (headers === 0) offenders.push(`mention bullet with no header above it: ${name}`);
      if (seen.has(name)) offenders.push(`duplicate mention: ${name}`);
      seen.add(name);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      offenders.push(`bullet that is not a bare mention: ${JSON.stringify(trimmed)}`);
      continue;
    }

    prose++;
    if (headers > 0) offenders.push(`prose line after the mentions header: ${JSON.stringify(trimmed)}`);
  }

  if (prose === 0) offenders.push("no prose line");
  if (headers > 0 && bullets === 0) offenders.push("mentions header with no bullet under it");
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
 * Mention-set offenders, each naming the offending name: a derived name missing
 * from the bullets, a listed name absent from the derived set, and a listed name
 * that is not a real skill at all.
 */
function mentionSet(bullets: string[], derived: Set<string>, names: Set<string>): string[] {
  const listed = new Set(bullets);
  return [
    ...[...derived].filter((name) => !listed.has(name)).map((name) => `mentions omit ${name}`),
    ...bullets.filter((name) => !derived.has(name)).map((name) => `mentions list ${name}, which its files never name`),
    ...bullets.filter((name) => !names.has(name)).map((name) => `mentions list ${name}, which is not a skill`),
  ];
}

/**
 * Order offenders: the authored bullet names compared to that same array under
 * `[...names].sort()` — codepoint order, so `pr-verify` precedes
 * `principle-fail-closed`. Names the first name out of place.
 */
function mentionOrder(bullets: string[]): string[] {
  const sorted = [...bullets].sort();
  const at = bullets.findIndex((name, index) => name !== sorted[index]);
  return at === -1 ? [] : [`mentions out of order at ${bullets[at]}, expected ${sorted[at]}`];
}

/**
 * The skill names `text` mentions, excluding `self` and filtered by `names`.
 * Two reference forms: a bare backticked lowercase-kebab token, and the path
 * `skills/<x>/SKILL.md`. Pure over file text — the file walk stays outside, so
 * the fixture needs no disk layout. `forms` narrows to one form so the
 * reference-form vacuity guard can isolate the path-only edges.
 */
function deriveMentions(
  text: string,
  self: string,
  names: Set<string>,
  forms: ReferenceForm[] = BOTH_FORMS,
): Set<string> {
  const patterns: Record<ReferenceForm, RegExp> = {
    bare: /`([a-z0-9][a-z0-9-]*)`/g,
    path: /skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md/g,
  };
  const found = new Set<string>();
  for (const form of forms) {
    for (const match of text.matchAll(patterns[form])) {
      const name = match[1] as string;
      if (name !== self && names.has(name)) found.add(name);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Read once at module scope: the page, plus 236 `.md` files
// (tests/methodology.test.ts:1883-1888).
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

/** `owner -> mentioned` edges over a name→text map, under the given forms. */
function edgeSet(texts: Map<string, string>, forms: ReferenceForm[]): Set<string> {
  return new Set(
    [...texts].flatMap(([owner, text]) =>
      [...deriveMentions(text, owner, NAMES, forms)].map((name) => `${owner} -> ${name}`),
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

const mentionSetOffenders = (name: string): string[] =>
  mentionSet(
    mentionBullets(bodyOf(name)),
    deriveMentions(ALL_MD_TEXT.get(name) ?? "", name, NAMES),
    NAMES,
  ).map((offender) => `${name}: ${offender}`);

const mentionOrderOffenders = (name: string): string[] =>
  mentionOrder(mentionBullets(bodyOf(name))).map((offender) => `${name}: ${offender}`);

describe("docs/skills.md catalog matches the skills on disk", () => {
  test("every entry's shape, sentence, mention set, and mention order match disk", () => {
    // Seven vacuity guards. Each names the property that vanished, because a
    // mis-scoped haystack makes every sweep below pass for the wrong reason
    // (docs/testing.md, "Prove a negative check can find a positive").
    expect(SKILL_DIRECTORIES.length).toBeGreaterThan(60); // (1) skills/ tree parsed
    expect(ENTRIES.length).toBeGreaterThan(60); // (2) page parsed
    expect(ENTRIES.filter((entry) => hasMentionsHeader(entry.body)).length).toBeGreaterThan(0); // (3)
    expect(ENTRIES.filter((entry) => !hasMentionsHeader(entry.body)).length).toBeGreaterThan(0); // (4)
    expect(ENTRIES.filter((entry) => entry.body.length === 0).map((entry) => entry.name)).toEqual(
      [],
    ); // (5) every parsed body non-empty

    // (6) Reference-form axis: at least one edge only the `skills/<x>/SKILL.md`
    // path form produced (69 today). A broken path pattern drops them silently.
    const allEdges = edgeSet(ALL_MD_TEXT, BOTH_FORMS);
    const bareEdges = edgeSet(ALL_MD_TEXT, ["bare"]);
    expect([...allEdges].filter((edge) => !bareEdges.has(edge)).length).toBeGreaterThan(0);

    // (7) Depth axis: the edge set over the 84 SKILL.md files alone is a STRICT
    // subset of the set over all 236 `.md` files (49 edges live only in
    // references/ and the two prompt templates). An equal pair means the walk
    // shrank — a shallow glob or a missed references/ directory.
    const skillMdEdges = edgeSet(SKILL_MD_TEXT, BOTH_FORMS);
    expect([...skillMdEdges].filter((edge) => !allEdges.has(edge))).toEqual([]);
    expect(skillMdEdges.size).toBeLessThan(allEdges.size);

    // Every skill on disk has an entry. Fails loud rather than skipping.
    expect(SKILL_DIRECTORIES.filter((name) => !ENTRY_BY_NAME.has(name))).toEqual([]);

    // The four sweeps, over all 84 entries.
    expect(SKILL_DIRECTORIES.flatMap(shapeOffenders)).toEqual([]);
    expect(SKILL_DIRECTORIES.flatMap(sentenceOffenders)).toEqual([]);
    expect(SKILL_DIRECTORIES.flatMap(mentionSetOffenders)).toEqual([]);
    expect(SKILL_DIRECTORIES.flatMap(mentionOrderOffenders)).toEqual([]);
  });

  test("the page-side rules each see a planted positive", () => {
    // A well-formed body, used as the negative control for every rule below.
    const clean = [
      "Lands a reviewed PR.",
      MENTIONS_HEADER,
      "- `pr-verify`",
      "- `principle-fail-closed`",
    ];
    expect(shape(clean)).toEqual([]);

    // Leftover bullet: a `**Purpose:**` line that survived the rewrite.
    expect(shape(["Lands a reviewed PR.", "- **Purpose:** Lands a reviewed PR."])).not.toEqual([]);

    // Second mentions header.
    expect(shape([...clean, MENTIONS_HEADER, "- `shipit`"])).not.toEqual([]);

    // Trailing clause after a name.
    expect(
      shape(["Lands a reviewed PR.", MENTIONS_HEADER, "- `pr-verify` for the checks"]),
    ).not.toEqual([]);

    // Duplicate name among the bullets.
    expect(
      shape(["Lands a reviewed PR.", MENTIONS_HEADER, "- `pr-verify`", "- `pr-verify`"]),
    ).not.toEqual([]);

    // Indented line, as the first line and as a later line.
    expect(shape(["  Lands a reviewed PR."])).not.toEqual([]);
    expect(
      shape(["Lands a reviewed PR.", MENTIONS_HEADER, "- `pr-verify`", "  continued"]),
    ).not.toEqual([]);

    // Drifted sentence: the page no longer copies the description's first sentence.
    const description = "Lands a reviewed PR. Use on stated ship intent.";
    expect(sentence(["Lands a reviewed PR."], description)).toEqual([]);
    expect(sentence(["Lands a merged PR."], description)).not.toEqual([]);

    // Phantom name: a bullet naming no skill on disk.
    const derived = new Set(["pr-verify", "principle-fail-closed"]);
    expect(mentionSet(["pr-verify", "principle-fail-closed"], derived, NAMES)).toEqual([]);
    expect(
      mentionSet(["pr-verify", "principle-fail-closed", "not-a-skill"], derived, NAMES),
    ).not.toEqual([]);

    // Dropped name: a derived name the page omits.
    expect(mentionSet(["pr-verify"], derived, NAMES)).not.toEqual([]);

    // Correct set, wrong order. Codepoint sort: `pr-verify` precedes
    // `principle-fail-closed`, which a dictionary sort would reverse.
    expect(mentionOrder(["pr-verify", "principle-fail-closed"])).toEqual([]);
    expect(mentionOrder(["principle-fail-closed", "pr-verify"])).not.toEqual([]);
  });

  test("the scanner returns exactly the two reference forms", () => {
    // A synthetic source standing in for one skill's `.md`, never a real skill
    // file: one bare backticked name, one `skills/<x>/SKILL.md` path naming a
    // different real skill, the fixture skill's own name, and a backticked
    // token naming no skill. Both real names are real skill directories, since
    // the skillNames() filter would otherwise drop them and hide a broken
    // pattern.
    const fixture = [
      "# Fixture skill body",
      "",
      "Call the Skill tool with `pr-verify` before landing.",
      "The fail-closed rule is restated at skills/principle-fail-closed/SKILL.md.",
      "This skill is `shipit`, and it never runs `not-a-real-skill`.",
    ].join("\n");

    expect([...deriveMentions(fixture, "shipit", NAMES)].sort()).toEqual([
      "pr-verify",
      "principle-fail-closed",
    ]);
  });
});
