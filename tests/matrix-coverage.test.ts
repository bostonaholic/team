// tests/matrix-coverage.test.ts
//
// Free guard: every paid agent-behavior suite (tests/*.evals.ts) must be wired
// into the behavioral-evals.yml matrix as a `file:` entry, so a future suite
// cannot land unwired and silently never run in CI. Conversely, every matrix
// `file:` entry must point at a real eval file, so a renamed/removed suite
// cannot leave a dangling matrix row.
//
// Parsing is a deliberately simple regex scan over the workflow text — no YAML
// dependency. The matrix rows are flow-style `- { name: x, file: ./tests/y }`,
// which we match directly.

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const WORKFLOW = join(
  REPO_ROOT,
  ".github",
  "workflows",
  "behavioral-evals.yml",
);

function discoverEvalFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "tests"))
    .filter((name) => name.endsWith(".evals.ts"))
    .map((name) => `./tests/${name}`)
    .sort();
}

function matrixFileEntries(): string[] {
  const yaml = readFileSync(WORKFLOW, "utf8");
  const entries: string[] = [];
  const re = /file:\s*(\.\/tests\/[A-Za-z0-9._-]+\.evals\.ts)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(yaml)) !== null) {
    const file = match[1];
    if (file !== undefined) entries.push(file);
  }
  return entries.sort();
}

describe("behavioral-evals matrix coverage", () => {
  test("every tests/*.evals.ts has a matrix file: row", () => {
    const evalFiles = discoverEvalFiles();
    const matrix = new Set(matrixFileEntries());
    expect(evalFiles.length).toBeGreaterThan(0);
    const missing = evalFiles.filter((f) => !matrix.has(f));
    expect(missing).toEqual([]);
  });

  test("every matrix file: row points at a real eval file", () => {
    const evalFiles = new Set(discoverEvalFiles());
    const matrix = matrixFileEntries();
    expect(matrix.length).toBeGreaterThan(0);
    const dangling = matrix.filter((f) => !evalFiles.has(f));
    expect(dangling).toEqual([]);
  });

  test("matrix file: rows are `./`-prefixed (bun path arg, not name filter)", () => {
    for (const file of matrixFileEntries()) {
      expect(file.startsWith("./tests/")).toBe(true);
    }
  });
});
