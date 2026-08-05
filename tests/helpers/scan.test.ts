import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  allowlistVerdict,
  collectMatches,
  extractCodeSpans,
  unguardedRmExpansions,
} from "./scan";

const HOST_PREFIX_PATTERN = "\\b(CLAUDE|CODEX|GEMINI)_[A-Z0-9_]+";

describe("collectMatches (system grep)", () => {
  // Hermetic fixture: the collector must run the `\b` pattern through system
  // grep. git grep -E silently drops `\b`, so this pin is what makes the
  // grep-discipline rule mechanical instead of a convention.
  const fixtureDir = join(tmpdir(), `scan-test-${process.pid}-${Date.now()}`);
  const fixtureFile = join(fixtureDir, "fixture.txt");

  beforeAll(() => {
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      fixtureFile,
      [
        "the host sets CLAUDE_PLUGIN_ROOT for installed plugins",
        "see CLAUDE.md and Claude Code for details",
        'CODEX_HOME="/home/user/.codex"',
      ].join("\n"),
    );
  });

  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  test("a \\b host-prefix pattern matches identifiers through the collector", () => {
    const matches = collectMatches(HOST_PREFIX_PATTERN, [fixtureFile]);
    expect(matches).toEqual([
      { path: fixtureFile, line: 1, text: "CLAUDE_PLUGIN_ROOT" },
      { path: fixtureFile, line: 3, text: "CODEX_HOME" },
    ]);
  });

  test("prose like CLAUDE.md and Claude Code never matches the host-prefix pattern", () => {
    const matches = collectMatches(HOST_PREFIX_PATTERN, [fixtureFile]);
    expect(matches.some((match) => match.line === 2)).toBe(false);
  });

  test("no match anywhere returns empty, not an error", () => {
    expect(collectMatches("ZZZ_NEVER_PRESENT", [fixtureFile])).toEqual([]);
  });

  test("an unreadable path throws instead of passing silently", () => {
    expect(() => collectMatches("anything", [join(fixtureDir, "missing.txt")])).toThrow();
  });

  test("an empty file list returns empty without invoking grep", () => {
    expect(collectMatches("anything", [])).toEqual([]);
  });
});

describe("extractCodeSpans (Markdown extractor)", () => {
  test("strips the blockquote prefix from fence markers and content", () => {
    const markdown = [
      "> remove it after installing:",
      "> ```bash",
      '> rm -rf "$CODEX_HOME/plugins"',
      "> ```",
    ].join("\n");
    expect(extractCodeSpans(markdown)).toEqual([
      { line: 3, text: 'rm -rf "$CODEX_HOME/plugins"', kind: "fence" },
    ]);
  });

  test("recognizes a fence indented three spaces inside a list item", () => {
    const markdown = ["1. sweep residue:", "", "   ```sh", '   rm -rf "$dir"', "   ```"].join("\n");
    // Content keeps its indentation: the extractor never dedents, because the
    // operand parser tokenizes line content wherever it starts.
    expect(extractCodeSpans(markdown)).toEqual([
      { line: 4, text: '   rm -rf "$dir"', kind: "fence" },
    ]);
  });

  test("a four-space ``` is an indented code block, not a fence", () => {
    const markdown = ["    ```", "    rm -rf $dir", "    ```"].join("\n");
    expect(extractCodeSpans(markdown)).toEqual([]);
  });

  test("extracts inline-code spans from prose", () => {
    const markdown = "Remove the docs: `rm -rf docs/plans/<id>`. Then run `git status`.";
    expect(extractCodeSpans(markdown)).toEqual([
      { line: 1, text: "rm -rf docs/plans/<id>", kind: "inline" },
      { line: 1, text: "git status", kind: "inline" },
    ]);
  });

  test("joins trailing-backslash continuation lines before segmenting", () => {
    const markdown = ["```sh", 'extra="$(find "$dir" -type f \\', '  -not -path "x")"', "```"].join(
      "\n",
    );
    expect(extractCodeSpans(markdown)).toEqual([
      { line: 2, text: 'extra="$(find "$dir" -type f   -not -path "x")"', kind: "fence" },
    ]);
  });

  test("an unterminated fence over-scans to end of file, never under-scans", () => {
    const markdown = ["```sh", "rm -rf $a", "still inside the fence"].join("\n");
    expect(extractCodeSpans(markdown)).toEqual([
      { line: 2, text: "rm -rf $a", kind: "fence" },
      { line: 3, text: "still inside the fence", kind: "fence" },
    ]);
  });
});

describe("unguardedRmExpansions (operand parser)", () => {
  test("the ${VAR:?} unset-abort form passes", () => {
    expect(unguardedRmExpansions('rm -rf "${dir:?}"')).toEqual([]);
  });

  test("multiple guarded expansions in one operand pass", () => {
    expect(unguardedRmExpansions('rm -rf "${PRIMARY_ROOT:?}/docs/plans/${ID:?}"')).toEqual([]);
  });

  test("a bare $ expansion fails", () => {
    expect(unguardedRmExpansions('rm -rf "$dir"')).toEqual(["$dir"]);
  });

  test("a braced expansion without :? fails", () => {
    expect(unguardedRmExpansions('rm -rf "${dir}"')).toEqual(["${dir}"]);
  });

  test("operands with no expansion at all pass", () => {
    expect(unguardedRmExpansions("rm -rf docs/plans/<id>")).toEqual([]);
  });

  test("rm -rf with no operands passes", () => {
    expect(unguardedRmExpansions("rm -rf")).toEqual([]);
  });

  test("the operand segment ends at &&: a later $ belongs to the next command", () => {
    expect(unguardedRmExpansions('rm -rf "${dir:?}" && echo "removed: $dir"')).toEqual([]);
  });

  test("the operand segment ends at ; and |", () => {
    expect(unguardedRmExpansions('rm -rf "${a:?}"; echo "$a"')).toEqual([]);
    expect(unguardedRmExpansions('rm -rf "${a:?}" | tee "$log"')).toEqual([]);
  });

  test("$ inside single quotes is opaque to the shell and passes", () => {
    expect(unguardedRmExpansions("rm -rf '$literal'")).toEqual([]);
  });

  test("$ after an unquoted # is a comment and is stripped", () => {
    expect(unguardedRmExpansions("rm -rf x # also removes $other")).toEqual([]);
  });

  test("an unguarded expansion before a comment still fails", () => {
    expect(unguardedRmExpansions("rm -rf $dir # cleanup")).toEqual(["$dir"]);
  });
});

describe("allowlistVerdict", () => {
  const matchAt = (path: string, line: number) => ({ path, line, text: "TOKEN" });

  test("exact counts at listed paths pass", () => {
    const matches = [matchAt("a.md", 1), matchAt("a.md", 9), matchAt("b.md", 2)];
    const allowlist = [
      { path: "a.md", count: 2 },
      { path: "b.md", count: 1 },
    ];
    expect(allowlistVerdict(matches, allowlist)).toEqual([]);
  });

  test("a match at an unlisted path fails", () => {
    const failures = allowlistVerdict([matchAt("rogue.md", 5)], []);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("rogue.md:5");
  });

  test("more matches than the entry's count fails", () => {
    const failures = allowlistVerdict(
      [matchAt("a.md", 1), matchAt("a.md", 2)],
      [{ path: "a.md", count: 1 }],
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("a.md");
  });

  test("fewer matches than the entry's count fails as stale entry or blind collector", () => {
    const shortCount = allowlistVerdict([matchAt("a.md", 1)], [{ path: "a.md", count: 2 }]);
    expect(shortCount).toHaveLength(1);

    const zeroMatches = allowlistVerdict([], [{ path: "a.md", count: 2 }]);
    expect(zeroMatches).toHaveLength(1);
    expect(zeroMatches[0]).toContain("blind collector");
  });
});
