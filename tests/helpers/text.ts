// Shared text/file helpers for the structural test suites.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function read(path: string): string {
  return readFileSync(path, "utf8");
}

// Collapse every run of whitespace, newlines included, to a single space.
// Content assertions read through this so a phrase a line wrap split across two
// lines still matches. Where a paragraph breaks is formatting, never a
// contract — see docs/testing.md, "A tripwire asserts a contract, never a
// wording".
export function squash(text: string): string {
  return text.replace(/\s+/g, " ");
}

// Frontmatter slice: the lines strictly between the first and second `---`
// markers, and only when the first one opens the file. If the file opens
// otherwise, or fewer than two markers exist, the slice is empty ("") and
// dependent assertions must fail, not skip.
export function frontmatter(text: string): string {
  const lines = text.split("\n");
  // Frontmatter opens line 1 or it is not frontmatter, which is the rule the
  // host applies. Without this, a body holding two thematic breaks slices out
  // as a block and its prose could satisfy a frontmatter check.
  if (lines[0] !== "---") return "";
  let count = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (/^---$/.test(line)) {
      count++;
      continue;
    }
    if (count === 1) out.push(line);
  }
  // An unterminated block is not frontmatter. Returning the rest of the file
  // would let a body sentence satisfy a frontmatter check.
  return count < 2 ? "" : out.join("\n");
}

// The two roots that hold entry-point skills: the distributed plugin and the
// dev workspace. Both answer the same one-sentence description rule in
// `docs/architecture.md`, so both sweeps and the guard sweep read one list.
const SKILL_ROOTS = ["skills", join(".claude", "skills")];

// A missing root throws out of readdirSync. Fail loud: an empty list would let
// every per-file sweep over it pass on zero files.
function skillFilesUnder(repoRoot: string, root: string): string[] {
  return readdirSync(join(repoRoot, root))
    .sort()
    .map((name) => join(root, name, "SKILL.md"))
    .filter((path) => existsSync(join(repoRoot, path)));
}

// Resolve a frontmatter slice through the same YAML parser the host routes
// on. Hand-rolled key rules diverged from it in a class of ways — a quoted
// scalar swallowed its trailing comment, a duplicate key kept the first value
// where YAML keeps the last — and every divergence let a sweep read something
// the host never sees. One parse settles quoting, comments, duplicate keys,
// and flow collections for every field read below, so two fields of one file
// can never disagree about what the host got.
function fields(fm: string): Record<string, unknown> {
  // A slice that is not a mapping (the empty slice above all) holds no keys,
  // so every field is absent rather than malformed.
  const parsed: unknown = Bun.YAML.parse(fm);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const mapping = parsed as Record<string, unknown>;
  // Scalars only. A mapping or sequence at the root is the shape a YAML merge
  // key (`<<: *anchor`) needs to splice a field into the root mapping, and
  // merge keys are a YAML 1.1 extension a 1.2 host may not resolve — so this
  // parser and the host would read different fields. No shipped frontmatter
  // needs a nested value.
  for (const [key, value] of Object.entries(mapping)) {
    if (value !== null && typeof value === "object") {
      throw new Error(`unsupported nested frontmatter value for ${key}`);
    }
  }
  return mapping;
}

// Extract the description field's text from a frontmatter slice.
export function descriptionText(fm: string): string {
  const value = fields(fm).description;
  // Absent stays "": the caller's own empty-description branch reports it.
  if (value === undefined) return "";
  // A number or explicit null is a style this sweep cannot read. Stringifying
  // it would match on punctuation the host never renders, so fail loud.
  if (typeof value !== "string") {
    throw new Error(`unsupported description value: ${JSON.stringify(value)}`);
  }
  // A block scalar keeps its newlines. Collapsing them yields the one line of
  // text a host renders, which is what every caller compares against.
  return squash(value).trim();
}

// Whether a frontmatter slice leaves the skill reachable from the slash menu.
// Read through the same parser as the description, because this key decides
// which files are swept AT ALL: a file that leaves the enumeration leaves the
// guard sweep, the trigger-phrase sweep, and the guard-class key-set equality
// in one move.
export function isUserInvocable(fm: string): boolean {
  const value = fields(fm)["user-invocable"];
  // The default. Only an explicit `false` hides a skill.
  if (value === undefined) return true;
  // `"false"` is a string, not the boolean the host reads. Guessing which one
  // the host meant is how the two reads drift apart again.
  if (typeof value !== "boolean") {
    throw new Error(`unsupported user-invocable value: ${JSON.stringify(value)}`);
  }
  return value;
}

// The path leads the message, so a malformed SKILL.md names itself rather
// than the parser or this test file.
function forFile<T>(repoRoot: string, file: string, readField: (fm: string) => T): T {
  try {
    return readField(frontmatter(read(join(repoRoot, file))));
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${file}: ${detail}`);
  }
}

export function descriptionFor(repoRoot: string, file: string): string {
  return forFile(repoRoot, file, descriptionText);
}

// Every SKILL.md under either root that does not set `user-invocable: false`
// is a user-facing entry point. Repo-relative paths, sorted, so offender
// output is stable across runs.
export function userInvocableSkillFiles(repoRoot: string): string[] {
  return SKILL_ROOTS.flatMap((root) => skillFilesUnder(repoRoot, root))
    .filter((file) => forFile(repoRoot, file, isUserInvocable))
    .sort();
}
