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

// The frontmatter `description` value, unquoted and unescaped. Both YAML quote
// styles are unquoted (`''` and `\"` unescaped); a `>` block scalar folds to
// spaces and a `|` block scalar keeps its newlines. "" when the field is
// missing, so dependent assertions fail loud, never vacuously.
export function description(text: string): string {
  const lines = frontmatter(text).split("\n");
  const index = lines.findIndex((line) => line.startsWith("description:"));
  if (index < 0) return "";
  const value = lines[index]!.replace(/^description:\s*/, "");
  if (!/^[|>][-]?$/.test(value)) {
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value[0] === '"' ? value.slice(1, -1).replace(/\\([\\"])/g, "$1") : value.slice(1, -1).replace(/''/g, "'");
    }
    return value.trim();
  }
  const continuation: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!/^\s/.test(line)) break;
    continuation.push(line.trim());
  }
  const folded = value.startsWith(">") ? continuation.join(" ").replace(/\s+/g, " ") : continuation.join("\n");
  return value.endsWith("-") ? folded.trimEnd() : `${folded.trim()}\n`;
}
