import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  agentFiles,
  allowlistVerdict,
  extractCodeSpans,
  skillFiles,
  unguardedRmExpansions,
  type AllowlistEntry,
  type GrepMatch,
} from "./helpers/scan";
import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();

// A documented `rm -rf` whose operand holds an unguarded `$` expansion is a
// silent no-op or a wrong-target deletion the moment the variable is unset —
// the reader copies the command as printed. Every expansion among an
// `rm -rf` command's operands must therefore use the unset-abort `${VAR:?}`
// form. README.md is scanned deliberately: it documents destructive commands
// even though it does not ship.
//
// Empty today; a future counter-example code span enters as a
// (path, expected count) entry justified by a comment, the same shape the
// host-binding sweep uses.
const ALLOWLIST: AllowlistEntry[] = [];

function scannedFiles(): string[] {
  return [...agentFiles(), ...skillFiles(), "README.md"];
}

function unguardedRmMatches(): GrepMatch[] {
  const violations: GrepMatch[] = [];
  for (const file of scannedFiles()) {
    for (const span of extractCodeSpans(read(join(REPO_ROOT, file)))) {
      for (const expansion of unguardedRmExpansions(span.text)) {
        violations.push({ path: file, line: span.line, text: expansion });
      }
    }
  }
  return violations;
}

describe("destructive-command guard: documented rm -rf operands", () => {
  // The content pins below read the pinned files directly, so this file-list
  // assertion is what ties them to the sweep: if the enumerator stops
  // covering a pinned site, the pins would otherwise stay green while the
  // real verdict path scans nothing.
  test("the sweep's file list covers every pinned site", () => {
    const files = scannedFiles();
    expect(files).toContain("README.md");
    expect(files).toContain(join("skills", "worktree-isolation", "SKILL.md"));
    expect(files).toContain(join("skills", "pr-cleanup", "SKILL.md"));
  });

  // Content pins, not file-list pins: a healthy file list proves nothing if
  // the extractor stops finding code at these sites. Each pin holds one of
  // the fence forms the guarded sites actually use.
  test("extractor finds the rm -rf span in README.md's blockquote-wrapped fence", () => {
    const spans = extractCodeSpans(read(join(REPO_ROOT, "README.md")));
    expect(spans.some((span) => span.kind === "fence" && span.text.includes("rm -rf"))).toBe(true);
  });

  test("extractor finds the rm -rf span in worktree-isolation's indented fence", () => {
    const spans = extractCodeSpans(read(join(REPO_ROOT, "skills", "worktree-isolation", "SKILL.md")));
    expect(spans.some((span) => span.kind === "fence" && span.text.includes("rm -rf"))).toBe(true);
  });

  test("calibration: pr-cleanup's bare inline span and guarded fence both pass", () => {
    const spans = extractCodeSpans(read(join(REPO_ROOT, "skills", "pr-cleanup", "SKILL.md")));
    const inlineSpans = spans.filter(
      (span) => span.kind === "inline" && span.text.includes("rm -rf"),
    );
    const fenceSpans = spans.filter(
      (span) => span.kind === "fence" && span.text.includes("rm -rf"),
    );
    expect(inlineSpans.length).toBeGreaterThan(0);
    expect(fenceSpans.length).toBeGreaterThan(0);
    for (const span of [...inlineSpans, ...fenceSpans]) {
      expect(unguardedRmExpansions(span.text)).toEqual([]);
    }
  });

  test("every $ expansion among rm -rf operands uses the ${VAR:?} form", () => {
    expect(allowlistVerdict(unguardedRmMatches(), ALLOWLIST)).toEqual([]);
  });
});
