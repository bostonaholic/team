// tests/helpers/seed.ts
//
// Shared seed-extraction helper for the light-prior-state L5 evals
// (team-research, team-design, team-structure, team-plan). Those evals embed
// an upstream pipeline artifact (questions.md, research.md, design.md,
// structure.md) inside the fixture input.md body as a labeled fenced block,
// then write it into the eval's working directory before spawning the model.
//
// This module owns ONLY the parsing of that labeled fenced block — a pure,
// deterministic, free L1 function. It does not write files and does not change
// any existing harness helper's behavior.

// Parse a labeled fenced block out of a fixture body. The fence opener is
//   ```<lang> <relativePath>
// and the content runs to the next ``` line. Returns the inner text, or null
// when no block labeled with `relativePath` is present.
export function extractSeed(body: string, relativePath: string): string | null {
  const lines = body.split("\n");
  let inBlock = false;
  const out: string[] = [];
  for (const line of lines) {
    if (!inBlock) {
      const open = /^```[A-Za-z0-9_-]*\s+(\S+)\s*$/.exec(line);
      if (open && open[1] === relativePath) {
        inBlock = true;
      }
      continue;
    }
    if (/^```\s*$/.test(line)) break;
    out.push(line);
  }
  return inBlock ? out.join("\n") : null;
}
