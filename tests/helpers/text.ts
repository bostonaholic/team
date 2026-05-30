// Shared text/file helpers for the structural test suites.

import { readFileSync } from "node:fs";

export function read(path: string): string {
  return readFileSync(path, "utf8");
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
