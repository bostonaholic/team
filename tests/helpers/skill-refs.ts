// Cross-reference helpers for skill-to-skill references.
//
// Team's prose distinguishes two kinds of reference, and the distinction is
// mechanical (see docs/architecture.md, "Methodology skills"):
//
//   LOAD     — `Call the Skill tool with \`<name>\`` — the reader must go
//              execute that skill. Encoded as a BARE NAME, because that is
//              what the Skill tool takes as its argument.
//   CITATION — `skills/<name>/SKILL.md` — a schema lookup, a "see also", a
//              rule restated nearby. Encoded as a PATH.
//
// The load form is the machine-readable half of a cross-reference, exactly as
// the path form is for a citation, so asserting it is asserting the reference
// and not the sentence around it. Two consequences worth stating plainly:
//
//   - `PHRASE` below is load-bearing. Changing the convention's wording means
//     changing it here, in one place, on purpose.
//   - A bare name resolves to nothing on its own, so `skillNames()` exists to
//     prove every referenced name is a real skill. That catches a rename AND a
//     typo; the old path assertions caught only a rename.

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { squash } from "./text";

// The canonical load phrase. Case-insensitive on the leading verb only: it
// opens a sentence ("Call the Skill tool with ...") or rides mid-sentence
// ("..., call the Skill tool with ...").
const PHRASE = /call the Skill tool with\b/gi;

// The contract string every design-review caller must carry when it hands the
// brief to its subagent.
export const SUBSTITUTION_CLAUSE = "artifact directory substituted";

// A skill name: lowercase kebab. Deliberately narrow, so the backticked
// non-skill tokens that share these clauses cannot match — `CHANGELOG.md` and
// `TEAM_DISABLE_CROSS_MODEL` (uppercase), `6-design.md` (dot),
// `## When Implementing` and `gh pr create --draft` (spaces).
const NAME = /`([a-z0-9][a-z0-9-]*)`/g;

// Every directory under skills/ that holds a SKILL.md. This is the authority a
// referenced name is checked against.
export function skillNames(repoRoot: string): Set<string> {
  const root = join(repoRoot, "skills");
  const names = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(root, name, "SKILL.md")));
  return new Set(names);
}

// The skill names `text` instructs a load of, deduped, in first-seen order.
//
// Reads through squash() because this repo hard-wraps prose: the phrase and the
// name it takes routinely land on different lines, and a line-oriented match
// would sweep straight past them (docs/testing.md, "The pattern cannot match
// the file's own line breaks").
//
// Each match collects every backticked name from the phrase up to the end of
// its clause, so the list form — "Call the Skill tool with `a`, `b`, and `c`" —
// yields all three rather than only the first.
export function loadedSkills(text: string): string[] {
  const flat = squash(text);
  const found: string[] = [];
  for (const match of flat.matchAll(PHRASE)) {
    const tail = flat.slice((match.index ?? 0) + match[0].length);
    // Clause end: the first sentence-or-clause terminator followed by space.
    // A name never contains one, so this cannot truncate mid-reference.
    const clause = tail.split(/(?<=[.:;!?])\s/)[0] ?? tail;
    for (const name of clause.matchAll(NAME)) {
      const captured = name[1];
      if (captured && !found.includes(captured)) found.push(captured);
    }
  }
  return found;
}

// True when `text` instructs a load of `name` through the Skill tool.
export function loadsSkill(text: string, name: string): boolean {
  return loadedSkills(text).includes(name);
}
