// tests/docs-install-parity.test.ts
//
// L2 tripwire (free, deterministic): README.md and docs/index.md are the two
// self-contained install surfaces (GitHub and team.bostonaholic.dev). Each
// must carry all ten install/uninstall command strings verbatim, so a reader
// on either surface can install and uninstall on every host without leaving
// the page.
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

describe("docs-install-parity: README.md and docs/index.md each carry all ten install/uninstall command strings verbatim", () => {
  test("README.md carries all ten install/uninstall command strings verbatim", () => {
    const readme = readIf(README_MD);
    // Guard: a missing README must fail cleanly, not vacuously pass.
    expect(readme.length).toBeGreaterThan(0);

    expect(readme).toContain("claude plugin marketplace add /path/to/team");
    expect(readme).toContain("claude plugin install team@team-dev");
    expect(readme).toContain("script/dev-install claude");
    expect(readme).toContain("script/dev-uninstall claude");
    expect(readme).toContain("codex plugin marketplace add /path/to/team");
    expect(readme).toContain("codex plugin add team@team-dev");
    expect(readme).toContain("agy plugin install /path/to/team");
    expect(readme).toContain("agy plugin uninstall team");
    expect(readme).toContain("script/dev-install antigravity");
    expect(readme).toContain("script/dev-uninstall antigravity");
  });

  test("docs/index.md carries all ten install/uninstall command strings verbatim", () => {
    const docsIndex = readIf(DOCS_INDEX_MD);
    // Guard: a missing docs page must fail cleanly, not vacuously pass.
    expect(docsIndex.length).toBeGreaterThan(0);

    expect(docsIndex).toContain("claude plugin marketplace add /path/to/team");
    expect(docsIndex).toContain("claude plugin install team@team-dev");
    expect(docsIndex).toContain("script/dev-install claude");
    expect(docsIndex).toContain("script/dev-uninstall claude");
    expect(docsIndex).toContain("codex plugin marketplace add /path/to/team");
    expect(docsIndex).toContain("codex plugin add team@team-dev");
    expect(docsIndex).toContain("agy plugin install /path/to/team");
    expect(docsIndex).toContain("agy plugin uninstall team");
    expect(docsIndex).toContain("script/dev-install antigravity");
    expect(docsIndex).toContain("script/dev-uninstall antigravity");
  });
});
