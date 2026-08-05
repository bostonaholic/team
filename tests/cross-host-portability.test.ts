import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
  agentFiles,
  allowlistVerdict,
  collectMatches,
  runtimeHookFiles,
  skillTreeFiles,
  type AllowlistEntry,
} from "./helpers/scan";

const REPO_ROOT = process.cwd();

function filesUnder(relativeDir: string): string[] {
  const collected: string[] = [];
  for (const entry of readdirSync(join(REPO_ROOT, relativeDir), { withFileTypes: true })) {
    const relativePath = join(relativeDir, entry.name);
    if (entry.isDirectory()) collected.push(...filesUnder(relativePath));
    else collected.push(relativePath);
  }
  return collected.sort();
}

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

describe("check (b): each manifest dir carries only its own host's prefix", () => {
  // A manifest is a host-owned schema file, so a prefix *class* is permitted
  // rather than exact identifiers — enumerating those would pin the host's
  // schema and churn with every host release. `.agents/plugins` maps to null
  // deliberately: `.agents/` is the host-neutral AGENTS.md convention name,
  // a future host may read that path, and the stricter rule costs nothing
  // today. A new host's manifest dir is one entry.
  const MANIFEST_DIR_PREFIX: Record<string, string | null> = {
    ".claude-plugin": "CLAUDE",
    ".codex-plugin": "CODEX",
    ".agents/plugins": null,
  };

  test("enumeration covers the Claude Code manifest", () => {
    expect(filesUnder(".claude-plugin")).toContain(join(".claude-plugin", "plugin.json"));
  });

  test("detection pin: the collector finds plugin.json's 3 permitted CLAUDE_ uses", () => {
    const matches = collectMatches(HOST_IDENTIFIER_PATTERN, filesUnder(".claude-plugin"));
    const pluginJsonMatches = matches.filter(
      (match) => match.path === join(".claude-plugin", "plugin.json"),
    );
    expect(pluginJsonMatches).toHaveLength(3);
    expect(pluginJsonMatches.every((match) => match.text.startsWith("CLAUDE_"))).toBe(true);
  });

  test("no manifest dir carries another host's prefix", () => {
    for (const [manifestDir, permittedPrefix] of Object.entries(MANIFEST_DIR_PREFIX)) {
      const matches = collectMatches(HOST_IDENTIFIER_PATTERN, filesUnder(manifestDir));
      const offending = matches.filter(
        (match) => permittedPrefix === null || !match.text.startsWith(`${permittedPrefix}_`),
      );
      expect(offending).toEqual([]);
    }
  });
});

describe("check (c): hooks may read no host env identifier beyond the allowlist", () => {
  // Hooks are shared runtime logic, unlike the host-owned manifests above:
  // every new host identifier that enters them is a portability liability,
  // so each one costs a deliberate edit to this exact-identifier set.
  const PERMITTED_HOOK_IDENTIFIERS = new Set(["CLAUDE_PROJECT_DIR"]);

  test("enumeration covers the runtime hooks", () => {
    expect(runtimeHookFiles()).toContain(join("hooks", "post-write-validate.mjs"));
  });

  test("detection pin: the collector finds all 3 CLAUDE_PROJECT_DIR uses", () => {
    const matches = collectMatches(HOST_IDENTIFIER_PATTERN, runtimeHookFiles());
    expect(matches.filter((match) => match.text === "CLAUDE_PROJECT_DIR")).toHaveLength(3);
  });

  test("the matched identifier set equals exactly the allowlist", () => {
    const matches = collectMatches(HOST_IDENTIFIER_PATTERN, runtimeHookFiles());
    expect(new Set(matches.map((match) => match.text))).toEqual(PERMITTED_HOOK_IDENTIFIERS);
  });
});
