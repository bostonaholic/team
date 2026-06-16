// tests/docs-versioning.test.ts
//
// L2 tripwire (free, deterministic): fences the docs realignment of
// docs/plans/2026-06-15-version-at-land-time — the land-time bump model where
// the DEV `version-bump` skill is Team's internal bumper and the generic
// runtime `/shipit` skill does the land (push/CI/merge). Also closes the
// doc-drift risk: no in-tree doc points at the deleted version-gate.yml.
//
// Defensive reads: a missing doc → "" so content assertions FAIL cleanly
// rather than throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const VERSIONING_DOC = join(REPO_ROOT, "docs", "versioning.md");
const CLAUDE_MD = join(REPO_ROOT, "CLAUDE.md");
const README_MD = join(REPO_ROOT, "README.md");
const AGENTS_MD = join(REPO_ROOT, "AGENTS.md");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

describe("docs/versioning.md: stale per-PR model removed (Slice 4)", () => {
  const doc = readIf(VERSIONING_DOC);

  test("docs/versioning.md exists", () => {
    expect(existsSync(VERSIONING_DOC)).toBe(true);
  });

  test("does not claim 'every PR bumps' the version", () => {
    expect(/every PR bumps/i.test(doc)).toBe(false);
  });

  test("does not reference version-gate.yml as a live enforcement gate", () => {
    // The gate is deleted in Slice 3; the doc must stop documenting it as the
    // enforcement of the per-PR bump.
    expect(doc).not.toContain("version-gate.yml");
  });
});

describe("docs/versioning.md: land-time model documented", () => {
  const doc = readIf(VERSIONING_DOC);

  test("names the land-time bump model", () => {
    expect(/land[- ]time/i.test(doc)).toBe(true);
  });

  test("names the dev `version-bump` skill as Team's bumper", () => {
    expect(doc).toContain("version-bump");
  });

  test("references the generic `/shipit` skill as the land step", () => {
    expect(doc).toContain("shipit");
  });
});

describe("CLAUDE.md: versioning invariant realigned", () => {
  const claude = readIf(CLAUDE_MD);

  test("CLAUDE.md exists", () => {
    expect(existsSync(CLAUDE_MD)).toBe(true);
  });

  test("versioning invariant names `version-bump` (the dev bumper)", () => {
    expect(claude).toContain("version-bump");
  });

  test("versioning invariant references `shipit` (the generic land step)", () => {
    expect(claude).toContain("shipit");
  });

  test("versioning invariant names the land-time model", () => {
    expect(/land[- ]time/i.test(claude)).toBe(true);
  });

  test("versioning invariant no longer points at version-gate.yml", () => {
    expect(claude).not.toContain("version-gate.yml");
  });
});

describe("doc drift guard: no in-tree doc points at version-gate.yml (Slice 4)", () => {
  // design Risk: "no in-tree doc still points contributors at the deleted
  // `version-gate.yml` as the gate." CHANGELOG.md history is excluded — it
  // legitimately records the gate's past existence.
  const docs: [string, string][] = [
    ["docs/versioning.md", readIf(VERSIONING_DOC)],
    ["CLAUDE.md", readIf(CLAUDE_MD)],
    ["README.md", readIf(README_MD)],
    ["AGENTS.md", readIf(AGENTS_MD)],
  ];

  for (const [name, text] of docs) {
    test(`${name} does not reference version-gate.yml`, () => {
      expect(text).not.toContain("version-gate.yml");
    });
  }
});
