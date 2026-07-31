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
  return out.join("\n");
}
