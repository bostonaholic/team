// tests/docs-install-parity.test.ts
//
// L2 tripwire (free, deterministic): README.md and docs/index.md are the two
// self-contained install surfaces (GitHub and team.bostonaholic.dev). Each
// must carry all eight install/uninstall command strings verbatim, and every
// `rm -rf` safety-guard invocation on each surface must point at the Codex
// plugin cache prefix — a mistyped prefix is a silent no-op for the reader.
//
// This file pins WHERE removal points (the path prefix). WHICH skills are
// named after the prefix is a separate invariant — set equality against the
// guarded-skill set on disk, in tests/pr-watch-as-reviewer-skill.test.ts.
// The skill names are deliberately not pinned here: freezing them in this
// file would fight that invariant.
//
// Defensive reads: a missing file → "" so content assertions FAIL cleanly
// rather than throwing ENOENT (the mechanical gate rejects crashes).

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const README_MD = join(REPO_ROOT, "README.md");
const DOCS_INDEX_MD = join(REPO_ROOT, "docs", "index.md");

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

// The path prefix every removal command must target. The skill name after
// the prefix belongs to the set-equality invariant, not this file. The :?
// expansion makes an unset CODEX_HOME abort loudly instead of no-opping.
const RM_RF_PREFIX = '"${CODEX_HOME:?}/plugins/cache"/*/team/*/skills/';

// Every rm -rf invocation's target token, path shape only — prose around
// the command can change freely without touching this extraction.
function rmRfTargets(text: string): string[] {
  return [...text.matchAll(/rm -rf\s+(\S+)/g)].map((m) => m[1] ?? "");
}

describe("docs-install-parity: README.md and docs/index.md each carry all eight install/uninstall command strings verbatim", () => {
  test("README.md carries all eight install/uninstall command strings verbatim", () => {
    const readme = readIf(README_MD);
    // Guard: a missing README must fail cleanly, not vacuously pass.
    expect(readme.length).toBeGreaterThan(0);

    expect(readme).toContain("claude plugin marketplace add /path/to/team");
    expect(readme).toContain("claude plugin install team@team-dev");
    expect(readme).toContain("codex plugin marketplace add /path/to/team");
    expect(readme).toContain("codex plugin add team@team-dev");
    expect(readme).toContain("agy plugin install /path/to/team");
    expect(readme).toContain("agy plugin uninstall team");
    expect(readme).toContain("script/dev-install antigravity");
    expect(readme).toContain("script/dev-uninstall antigravity");
  });

  test("docs/index.md carries all eight install/uninstall command strings verbatim", () => {
    const docsIndex = readIf(DOCS_INDEX_MD);
    // Guard: a missing docs page must fail cleanly, not vacuously pass.
    expect(docsIndex.length).toBeGreaterThan(0);

    expect(docsIndex).toContain("claude plugin marketplace add /path/to/team");
    expect(docsIndex).toContain("claude plugin install team@team-dev");
    expect(docsIndex).toContain("codex plugin marketplace add /path/to/team");
    expect(docsIndex).toContain("codex plugin add team@team-dev");
    expect(docsIndex).toContain("agy plugin install /path/to/team");
    expect(docsIndex).toContain("agy plugin uninstall team");
    expect(docsIndex).toContain("script/dev-install antigravity");
    expect(docsIndex).toContain("script/dev-uninstall antigravity");
  });
});

describe('docs-install-parity: every rm -rf invocation on each surface targets the prefix "${CODEX_HOME:?}/plugins/cache"/*/team/*/skills/', () => {
  test("README.md has rm -rf invocations and every one targets the Codex cache prefix", () => {
    const readme = readIf(README_MD);
    expect(readme.length).toBeGreaterThan(0);

    const targets = rmRfTargets(readme);
    // Positive control: the extractor must find the invocations known to
    // exist, or the prefix assertions below prove nothing.
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target).toStartWith(RM_RF_PREFIX);
    }
  });

  test("docs/index.md has rm -rf invocations and every one targets the Codex cache prefix", () => {
    const docsIndex = readIf(DOCS_INDEX_MD);
    expect(docsIndex.length).toBeGreaterThan(0);

    const targets = rmRfTargets(docsIndex);
    // Positive control: a page with no removal commands has lost the safety
    // guard entirely — that must fail here, not vacuously pass the loop.
    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target).toStartWith(RM_RF_PREFIX);
    }
  });
});
