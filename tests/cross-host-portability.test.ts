import { describe, expect, test } from "bun:test";

import {
  agentFiles,
  allowlistVerdict,
  collectMatches,
  skillTreeFiles,
  type AllowlistEntry,
} from "./helpers/scan";

// The distributed surface (docs/cross-host-portability.md) must carry no
// host-prefixed identifier outside a deliberate allowlist entry: only the
// host that defines such an identifier resolves it, so any other host gets
// an empty expansion and a confusing failure. A new host is one entry here
// plus one in the manifest map below.
const HOST_PREFIXES = ["CLAUDE", "CODEX", "GEMINI"];
const HOST_IDENTIFIER_PATTERN = `\\b(${HOST_PREFIXES.join("|")})_[A-Z0-9_]+`;

describe("check (a): host-binding identifier sweep over agents/ and skills/", () => {
  // The sweep is whole-file and comments count — a comment is the copy-paste
  // seed for the next violation. The semantic line between *use* of a host
  // variable and documentation *about* one is drawn here, not in the parser:
  // each documentation-about site is an explicit (path, exact count) entry,
  // and the non-zero counts double as the sweep's positive detection signal.
  const ALLOWLIST: AllowlistEntry[] = [
    // The "what <skill-dir> resolves to on Claude Code" sentence (line 333).
    { path: "skills/writing-prose/SKILL.md", count: 1 },
    // The same fact in the bundled script's header comment (line 27).
    { path: "skills/writing-prose/ste-lint.mjs", count: 1 },
  ];

  function sweptFiles(): string[] {
    return [...agentFiles(), ...skillTreeFiles()];
  }

  test("enumeration covers agents, skill bodies, and bundled skill scripts", () => {
    const files = sweptFiles();
    expect(files).toContain("agents/researcher.md");
    expect(files).toContain("skills/team/SKILL.md");
    expect(files).toContain("skills/nested-agents/supports-nesting.mjs");
  });

  test("detection pin: the collector finds both seeded documentation-about sites", () => {
    // A blind collector returns zero matches everywhere; these two known
    // sites turning up empty is the loud failure that proves it.
    const matches = collectMatches(HOST_IDENTIFIER_PATTERN, sweptFiles());
    const countAt = (path: string) => matches.filter((match) => match.path === path).length;
    expect(countAt("skills/writing-prose/SKILL.md")).toBe(1);
    expect(countAt("skills/writing-prose/ste-lint.mjs")).toBe(1);
  });

  test("no host-prefixed identifier outside the allowlist", () => {
    const matches = collectMatches(HOST_IDENTIFIER_PATTERN, sweptFiles());
    expect(allowlistVerdict(matches, ALLOWLIST)).toEqual([]);
  });
});
