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
// markers. If fewer than two markers exist, the slice is empty ("") and
// dependent assertions must fail, not skip.
export function frontmatter(text: string): string {
  const lines = text.split("\n");
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

// Every SKILL.md under either root that does not set `user-invocable: false`
// is a user-facing entry point. Repo-relative paths, sorted, so offender
// output is stable across runs.
export function userInvocableSkillFiles(repoRoot: string): string[] {
  return SKILL_ROOTS.flatMap((root) => skillFilesUnder(repoRoot, root))
    .filter(
      (file) => !/^user-invocable: false$/m.test(frontmatter(read(join(repoRoot, file)))),
    )
    .sort();
}

// Everything from the first whitespace-preceded `#` onward. Callers apply it
// only where YAML treats that `#` as a comment opener.
function stripInlineComment(text: string): string {
  const at = text.search(/\s#/);
  return at === -1 ? text : text.slice(0, at);
}

// Extract the description field's text only from a frontmatter slice,
// handling both YAML styles in use: single-line scalar
// (`description: <text>`) and block scalar (`description: |` followed by
// indented lines until the first non-indented line). Scoping to the
// description prevents a false positive on the quoted `argument-hint`
// value elsewhere in the frontmatter.
export function descriptionText(fm: string): string {
  const lines = fm.split("\n");
  const start = lines.findIndex((line) => line.startsWith("description:"));
  if (start === -1) return "";
  const raw = (lines[start] ?? "").slice("description:".length);
  const trimmed = raw.trim();
  const opener = trimmed[0];
  const isQuoted = opener === '"' || opener === "'";
  // Outside quotes, a `#` preceded by whitespace opens a YAML comment and the
  // value ends there. Reading past it would let a guard the host's parser
  // discards satisfy a description check. Inside quotes the `#` is content,
  // and `foo#bar` has no preceding whitespace, so both are kept.
  const inline = isQuoted ? trimmed : stripInlineComment(raw).trim();
  if (inline !== "" && inline !== "|") {
    // A fully-quoted inline scalar must be unwrapped: returned verbatim,
    // its surrounding quotes would make matchAll treat the whole value as
    // one "phrase" and pass with zero real trigger phrases. A quote that
    // opens but never closes on the line is an unsupported style — throw
    // rather than scan text that YAML would parse differently.
    // A folded scalar would otherwise return the literal ">" and drop the
    // body, passing an absence check for the wrong reason. Throw, like the
    // unterminated quote below.
    if (inline.startsWith(">")) {
      throw new Error(`unsupported description scalar style: ${inline}`);
    }
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
    if (line === undefined) break;
    // A blank line continues a `|` block in YAML, so it is skipped rather
    // than treated as the terminator: a guard sitting after a paragraph
    // break is still part of the description.
    if (line.trim() === "") continue;
    if (!/^\s+\S/.test(line)) break;
    block.push(line.trim());
  }
  return block.join(" ");
}

// The path leads the message, so a malformed SKILL.md names itself rather
// than the parser or this test file.
export function descriptionFor(repoRoot: string, file: string): string {
  try {
    return descriptionText(frontmatter(read(join(repoRoot, file))));
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`${file}: ${detail}`);
  }
}
