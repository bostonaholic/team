// Shared text/file helpers for the structural test suites.

import { readFileSync } from "node:fs";

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

// Extract the description field's text only from a frontmatter slice,
// handling both YAML styles in use: single-line scalar
// (`description: <text>`) and block scalar (`description: |` followed by
// indented lines until the first non-indented line). Scoping to the
// description prevents a false positive on the quoted `argument-hint`
// value elsewhere in the frontmatter.
//
// Latent hole: any inline value other than "" and "|" is treated as a
// scalar, so `|-`, `|+` or `>` would measure as a two-character
// description. Inert today — all 13 block scalars use a bare `|` — and it
// fails loud downstream at tests/architecture.test.ts's phrase check.
export function descriptionText(fm: string): string {
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

// Frontmatter slice: the lines strictly between the first and second `---`
// markers. Zero markers is a legal shape — the slice is empty ("") and
// dependent assertions fail rather than skip. Exactly one marker is an
// UNTERMINATED block: returning the whole body would silently feed body
// prose to a frontmatter predicate, so it throws instead, quoting the two
// signals this signature can offer (it takes text, not a path).
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
  if (count === 1) {
    throw new Error(
      `unterminated frontmatter: an opening --- is never closed. The block ` +
        `swallowed ${out.length} lines starting ${JSON.stringify(out[0] ?? "")}`,
    );
  }
  return out.join("\n");
}
