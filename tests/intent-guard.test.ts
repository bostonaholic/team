// tests/intent-guard.test.ts
//
// L2 tripwire (free, deterministic): the explicit-intent guard, which until
// now was checked by nobody.
//
// `docs/architecture.md` requires a side-effecting entry-point skill to state
// an explicit-intent guard in its description, and `tests/architecture.test.ts`
// enforces only the other half of that sentence (a quoted phrase plus the
// literal `/<name>`). The guard itself was left to the author and the
// reviewer, so deleting it shipped green.
//
// This asserts a REQUIRED FORM, which `docs/testing.md` permits under exactly
// three conditions, all of which hold here: the prose itself mandates the
// form, ONE constant owns it (`tests/helpers/intent-guard.ts`), and every
// teaching copy of it is swept below. A rewrite that keeps the guard stays
// green; a rewrite that drops it is not a rewrite, it is a removed safety
// control.
//
// What this file does NOT judge: whether a guard sentence is TRUE, or whether
// a skill's class is right. Key-set equality forces a value, never a correct
// one. That residual is stated in the design and belongs at L5.
//
// Assumption: the parser controls for tests/helpers/text.ts are not in this
// file — they are their own suite, tests/helpers/text.test.ts.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  CANONICAL,
  GUARD_CLASS,
  GUARD_CLOSE,
  GUARD_OPEN,
  carriesGuard,
} from "./helpers/intent-guard";
import { frontmatter, read, squash, userInvocableSkillFiles } from "./helpers/text";

const REPO_ROOT = process.cwd();

// The surfaces that show the required form LITERALLY, so a reader could copy
// it from there. A surface that only describes the rule in its own words is
// not a teaching copy and is deliberately unswept.
const TEACHING_COPIES = [
  join("docs", "architecture.md"),
  join("skills", "principle-explicit-intent", "SKILL.md"),
  join(".claude", "skills", "create-team-skill", "SKILL.md"),
];

// ---------------------------------------------------------------------------
// Parsing.
//
// Scaffolding, on its way to `tests/helpers/text.ts`: `descriptionText()` is
// copied verbatim from tests/architecture.test.ts (two parsers that differ
// would let one sweep see a guard the other cannot), and the path-wrapping
// `descriptionFor()` carries the signature it will keep once shared. The
// enumerator is already shared: both description sweeps read the same list
// from the same place, or the two halves of one sentence disagree about who
// they cover.
// ---------------------------------------------------------------------------

// Extract the description field's text only from a frontmatter slice,
// handling both YAML styles in use: single-line scalar
// (`description: <text>`) and block scalar (`description: |` followed by
// indented lines until the first non-indented line). Scoping to the
// description prevents a false positive on the quoted `argument-hint`
// value elsewhere in the frontmatter.
function descriptionText(fm: string): string {
  const lines = fm.split("\n");
  const start = lines.findIndex((line) => line.startsWith("description:"));
  if (start === -1) return "";
  const inline = (lines[start] ?? "").slice("description:".length).trim();
  if (inline !== "" && inline !== "|") {
    // A fully-quoted inline scalar must be unwrapped: returned verbatim,
    // its surrounding quotes would make matchAll treat the whole value as
    // one "phrase" and pass with zero real trigger phrases. A quote that
    // opens but never closes on the line is an unsupported style — throw
    // rather than scan text that YAML would parse differently.
    const quote = inline[0];
    if (quote === '"' || quote === "'") {
      if (inline.length < 2 || !inline.endsWith(quote)) {
        throw new Error(`unsupported description scalar style: ${inline}`);
      }
      const body = inline.slice(1, -1);
      return quote === '"'
        ? body.replace(/\\"/g, '"')
        : body.replace(/''/g, "'");
    }
    return inline;
  }
  const block: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !/^\s+\S/.test(line)) break;
    block.push(line.trim());
  }
  return block.join(" ");
}

// The path leads the message, so a malformed SKILL.md names itself rather
// than the parser or this test file.
function descriptionFor(repoRoot: string, file: string): string {
  try {
    return descriptionText(frontmatter(read(join(repoRoot, file))));
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${file}: ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// The offender rule.
//
// Takes its entries and its class map as arguments, rather than reading disk,
// so a synthetic pair can prove the rule reports what it claims to catch.
// ---------------------------------------------------------------------------

interface Entry {
  file: string;
  description: string;
}

function guardOffenders(entries: Entry[], classes: Record<string, "in" | "out">): string[] {
  const offenders: string[] = [];
  for (const { file, description } of entries) {
    // An empty extracted description carries no fragment, so it would pass
    // the "out" branch vacuously. It is an offender first, whatever its class.
    if (squash(description).trim() === "") {
      offenders.push(file);
      continue;
    }
    const membership = classes[file];
    if (membership === "in" && !carriesGuard(description)) offenders.push(file);
    if (membership === "out" && carriesGuard(description)) offenders.push(file);
  }
  return offenders;
}

// Defensive read: a missing file reads as "" so the length guard FAILS rather
// than the test throwing.
function surface(relative: string): string {
  const absolute = join(REPO_ROOT, relative);
  return existsSync(absolute) ? read(absolute) : "";
}

describe("the explicit-intent guard across every user-invocable skill", () => {
  test("every user-invocable skill is classified and every in-class description carries the guard", () => {
    const files = userInvocableSkillFiles(REPO_ROOT);

    // Key-set equality, both directions: an unclassified new skill and a
    // stale key for a deleted one each fail here, with the differing paths
    // printed. It doubles as the haystack guard — an empty enumeration
    // cannot pass the offender sweep below vacuously.
    expect(Object.keys(GUARD_CLASS).sort()).toEqual(files);

    const entries = files.map((file) => ({
      file,
      description: descriptionFor(REPO_ROOT, file),
    }));
    expect(guardOffenders(entries, GUARD_CLASS)).toEqual([]);
  });
});

describe("the guard sweep can see a positive", () => {
  // docs/testing.md, "Prove a negative check can find a positive" — a check
  // that finds nothing has not distinguished absent from blind. Synthetic
  // strings only, never fixture files on disk.

  const PLANTED_IN = join("skills", "planted-in-class", "SKILL.md");
  const PLANTED_OUT = join("skills", "planted-out-of-class", "SKILL.md");
  const PLANTED: Record<string, "in" | "out"> = {
    [PLANTED_IN]: "in",
    [PLANTED_OUT]: "out",
  };

  const CARRIER = 'Trigger on "do the planted thing" or "/planted".';

  test("the canonical teaching rendering satisfies the check it teaches", () => {
    expect(carriesGuard(CANONICAL)).toBe(true);
  });

  test("an in-class description with the guard stripped is reported", () => {
    const stripped = { file: PLANTED_IN, description: CARRIER };
    expect(guardOffenders([stripped], PLANTED)).toEqual([PLANTED_IN]);
  });

  test("an out-of-class description that carries the guard is reported", () => {
    const overreaching = { file: PLANTED_OUT, description: `${CARRIER} ${CANONICAL}` };
    expect(guardOffenders([overreaching], PLANTED)).toEqual([PLANTED_OUT]);
  });

  test("the two fragments in the wrong order are reported", () => {
    // The canonical form is ordered. Both fragments present, close first.
    const reversed = {
      file: PLANTED_IN,
      description: `${CARRIER} A run should ${GUARD_CLOSE} planted intent. ${GUARD_OPEN} planted intent.`,
    };
    expect(guardOffenders([reversed], PLANTED)).toEqual([PLANTED_IN]);
  });

  test("a two-close description whose only surviving close precedes the open is reported", () => {
    // The shape skills/pr-cleanup/SKILL.md carries: a mode-scoped close, then
    // the file-level guard. Deleting only the file-level close must go red,
    // or the earlier close stands in for the guard that was removed.
    const modeScoped = `Mode B runs only when the user says "abandon this" — ${GUARD_CLOSE} abandon intent from a stale PR.`;
    const intact = {
      file: PLANTED_IN,
      description: `${CARRIER} ${modeScoped} ${GUARD_OPEN} cleanup intent — ${GUARD_CLOSE} cleanup intent from a merged PR.`,
    };
    const fileLevelCloseDeleted = {
      file: PLANTED_IN,
      description: `${CARRIER} ${modeScoped} ${GUARD_OPEN} cleanup intent.`,
    };

    expect(guardOffenders([intact], PLANTED)).toEqual([]);
    expect(guardOffenders([fileLevelCloseDeleted], PLANTED)).toEqual([PLANTED_IN]);
  });

  test("a conforming in-class and out-of-class pair is not reported", () => {
    const conforming = [
      { file: PLANTED_IN, description: `${CARRIER} ${CANONICAL}` },
      { file: PLANTED_OUT, description: CARRIER },
    ];
    expect(guardOffenders(conforming, PLANTED)).toEqual([]);
  });
});

describe("every teaching copy shows the canonical form verbatim", () => {
  // A doc that shows the form is showing the whole shape, so a paraphrase
  // that drifts teaches a guard this sweep would reject. Read through
  // squash(), because this repo hard-wraps every one of these copies.
  for (const relative of TEACHING_COPIES) {
    test(`${relative} contains the canonical form`, () => {
      const text = surface(relative);
      // Guard: a missing or renamed file must fail here, not pass vacuously.
      expect(text.length).toBeGreaterThan(0);
      expect(squash(text)).toContain(CANONICAL);
    });
  }

  test("a teaching copy with a word dropped fails the same check", () => {
    // The live drift: one copy omits "explicit" from the open fragment.
    const drifted = CANONICAL.replace("explicit ", "");
    expect(drifted).not.toBe(CANONICAL);
    expect(squash(drifted)).not.toContain(CANONICAL);
  });
});
