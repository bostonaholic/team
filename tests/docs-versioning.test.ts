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

describe("doc drift guard: no in-tree doc points at version-bump-check.yml (#120 retirement)", () => {
  // The always-red workflow is deleted; the pre-merge dev hook plus
  // version-bump's early runs enforce the invariant now. Retired-check history
  // in docs/versioning.md is written as a paraphrase that never names the
  // file, so no carve-out is needed there — CHANGELOG.md stays excluded, as
  // above, because it legitimately records history. The name survives only in
  // the deletion pin's comment (tests/ci-workflows.test.ts) and git history.
  const VB_SKILL = join(REPO_ROOT, ".claude", "skills", "version-bump", "SKILL.md");
  const docs: [string, string][] = [
    ["docs/versioning.md", readIf(VERSIONING_DOC)],
    ["CLAUDE.md", readIf(CLAUDE_MD)],
    ["README.md", readIf(README_MD)],
    ["AGENTS.md", readIf(AGENTS_MD)],
    [".claude/skills/version-bump/SKILL.md", readIf(VB_SKILL)],
  ];

  for (const [name, text] of docs) {
    test(`${name} does not reference version-bump-check.yml`, () => {
      expect(text).not.toContain("version-bump-check.yml");
    });
  }
});

// ---------------------------------------------------------------------------
// docs/plans/2026-08-28-rss-release-feed, Slice 3 — the release→Pages dispatch
// and its one-command recovery are written down (decision 16).
//
// Contracts only: the workflow file name, the trigger name, and the feed path.
// Never the wording (docs/testing.md:127-163).
// ---------------------------------------------------------------------------

// Body of a `## ` section, up to the next `## ` heading (or EOF).
function section(md: string, heading: string): string {
  const start = md.indexOf(`\n${heading}\n`);
  if (start === -1) return "";
  const rest = md.slice(start + heading.length + 2);
  const end = rest.search(/\n## /);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("docs/versioning.md: the release feed dispatch is documented (Slice 3)", () => {
  const doc = readIf(VERSIONING_DOC);
  const releaseFlow = section(doc, "## Release on merge");
  const recovery = section(doc, "## Recovery");

  test("the `## Release on merge` section is findable", () => {
    // Guard: a renamed heading would make every assertion below vacuous.
    expect(releaseFlow.length).toBeGreaterThan(0);
  });

  test("the release flow names the Pages dispatch and the feed path", () => {
    expect(releaseFlow).toContain("pages.yml");
    expect(releaseFlow).toContain("/rss.xml");
  });

  test("the `## Recovery` section is findable", () => {
    expect(recovery.length).toBeGreaterThan(0);
  });

  test("recovery names the workflow_dispatch re-run of pages.yml as the fix", () => {
    expect(recovery).toContain("workflow_dispatch");
    expect(recovery).toContain("pages.yml");
  });
});
