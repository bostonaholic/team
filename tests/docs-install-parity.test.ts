// tests/docs-install-parity.test.ts
//
// L2 tripwire (free, deterministic): README.md and docs/index.md are the two
// self-contained install surfaces (GitHub and team.bostonaholic.dev). Each
// must carry all eighteen install/uninstall command strings verbatim, so a reader
// on either surface can install and uninstall on every host without leaving
// the page.
//
// Each surface also documents the same three methods for every host — native,
// local checkout, live development — so a method a host lacks is stated rather
// than omitted. Four hosts times three methods is twelve headings per surface,
// and the three a host lacks say "Not supported by".
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

const HOST_COUNT = 4;

function readIf(path: string): string {
  return existsSync(path) ? read(path) : "";
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("docs-install-parity: README.md and docs/index.md each carry all eighteen install/uninstall command strings verbatim", () => {
  test("README.md carries all eighteen install/uninstall command strings verbatim", () => {
    const readme = readIf(README_MD);
    // Guard: a missing README must fail cleanly, not vacuously pass.
    expect(readme.length).toBeGreaterThan(0);

    expect(readme).toContain("claude plugin marketplace add bostonaholic/team");
    expect(readme).toContain("claude plugin marketplace add /path/to/team");
    expect(readme).toContain("claude plugin install team@team-dev");
    expect(readme).toContain("claude --plugin-dir /path/to/team");
    expect(readme).toContain("script/dev-install claude");
    expect(readme).toContain("script/dev-uninstall claude");
    expect(readme).toContain("codex plugin marketplace add bostonaholic/team");
    expect(readme).toContain("codex plugin marketplace add /path/to/team");
    expect(readme).toContain("codex plugin add team@team-dev");
    expect(readme).toContain("codex plugin remove team@team-dev");
    expect(readme).toContain("script/dev-install codex");
    expect(readme).toContain("script/dev-uninstall codex");
    expect(readme).toContain("agy plugin install /path/to/team");
    expect(readme).toContain("agy plugin uninstall team");
    expect(readme).toContain("script/dev-install antigravity");
    expect(readme).toContain("script/dev-uninstall antigravity");
    expect(readme).toContain("script/dev-install opencode");
    expect(readme).toContain("script/dev-uninstall opencode");
  });

  test("docs/index.md carries all eighteen install/uninstall command strings verbatim", () => {
    const docsIndex = readIf(DOCS_INDEX_MD);
    // Guard: a missing docs page must fail cleanly, not vacuously pass.
    expect(docsIndex.length).toBeGreaterThan(0);

    expect(docsIndex).toContain("claude plugin marketplace add bostonaholic/team");
    expect(docsIndex).toContain("claude plugin marketplace add /path/to/team");
    expect(docsIndex).toContain("claude plugin install team@team-dev");
    expect(docsIndex).toContain("claude --plugin-dir /path/to/team");
    expect(docsIndex).toContain("script/dev-install claude");
    expect(docsIndex).toContain("script/dev-uninstall claude");
    expect(docsIndex).toContain("codex plugin marketplace add bostonaholic/team");
    expect(docsIndex).toContain("codex plugin marketplace add /path/to/team");
    expect(docsIndex).toContain("codex plugin add team@team-dev");
    expect(docsIndex).toContain("codex plugin remove team@team-dev");
    expect(docsIndex).toContain("script/dev-install codex");
    expect(docsIndex).toContain("script/dev-uninstall codex");
    expect(docsIndex).toContain("agy plugin install /path/to/team");
    expect(docsIndex).toContain("agy plugin uninstall team");
    expect(docsIndex).toContain("script/dev-install antigravity");
    expect(docsIndex).toContain("script/dev-uninstall antigravity");
    expect(docsIndex).toContain("script/dev-install opencode");
    expect(docsIndex).toContain("script/dev-uninstall opencode");
  });

  test.each([
    ["README.md", README_MD],
    ["docs/index.md", DOCS_INDEX_MD],
  ])("%s documents all three install methods for every host", (_label, path) => {
    const surface = readIf(path);
    expect(surface.length).toBeGreaterThan(0);

    expect(occurrences(surface, "#### Native plugin installation")).toBe(HOST_COUNT);
    expect(occurrences(surface, "#### Local git checkout installation")).toBe(HOST_COUNT);
    expect(occurrences(surface, "#### Live development installation")).toBe(HOST_COUNT);
    // Codex has no live load; Antigravity and OpenCode have no remote source.
    expect(occurrences(surface, "Not supported by")).toBe(3);
  });
});
