import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import {
  agentFiles,
  allowlistVerdict,
  collectMatches,
  extractCodeSpans,
  runtimeHookFiles,
  skillFiles,
  skillTreeFiles,
  type AllowlistEntry,
} from "./helpers/scan";
import { frontmatter, read } from "./helpers/text";

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
    // The sentence explaining what <skill-dir> resolves to on Claude Code.
    { path: "skills/writing-prose/SKILL.md", count: 1 },
    // The same what-<skill-dir>-resolves-to fact in the script's header comment.
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

// Frontmatter keys anchor at column 0: eight skills carry `description: |`
// block scalars whose indented body lines contain colons, and a parser that
// trims leading whitespace before matching `<key>:` would read those body
// lines as keys and fail a legitimate file.
function frontmatterKeys(markdown: string): string[] {
  return frontmatter(markdown)
    .split("\n")
    .flatMap((line) => {
      const key = line.match(/^([A-Za-z][A-Za-z0-9_-]*):/);
      return key ? [key[1] ?? ""] : [];
    });
}

describe("check (d): README names the removal path of every model-invocation-disabled skill", () => {
  // Codex ignores `disable-model-invocation`, which silently re-arms a skill
  // its author locked to human invocation. The README documents that caveat
  // with a copyable removal path, and this check forces the caveat to track
  // the key: the literal `skills/<name>` must stay in README.md — a
  // rewording that hides the path behind a variable or broader glob goes
  // red, and that is the contract.
  function modelInvocationDisabledSkills(): string[] {
    return skillFiles()
      .filter((file) => frontmatterKeys(read(join(REPO_ROOT, file))).includes("disable-model-invocation"))
      .map((file) => file.split("/")[1] ?? "");
  }

  test("detection pin: pr-approve-watch carries the key today", () => {
    expect(modelInvocationDisabledSkills()).toContain("pr-approve-watch");
  });

  test("README carries the literal skills/<name> inside a code span for each detected skill", () => {
    // A code span, not prose: the removal path must stay copyable, and
    // fences and inline spans are a syntactic boundary the extractor
    // already draws.
    const readmeSpans = extractCodeSpans(read(join(REPO_ROOT, "README.md")));
    const missing = modelInvocationDisabledSkills().filter(
      (skillName) => !readmeSpans.some((span) => span.text.includes(`skills/${skillName}`)),
    );
    expect(missing).toEqual([]);
  });
});

describe("check (e): frontmatter keys stay inside the classified allowlists", () => {
  // A new frontmatter key arriving unclassified is the class that cost
  // pr-approve-watch its Codex guard: some host silently ignores the key and
  // the behavior it carried is gone. A legitimate new key hits red CI until
  // its one allowlist line is added — the review-visible diff is the point.
  const SKILL_KEYS = new Set([
    "name",
    "description",
    "user-invocable",
    "argument-hint",
    "effort",
    "disable-model-invocation",
  ]);
  const AGENT_KEYS = new Set([
    "name",
    "description",
    "model",
    "effort",
    "tools",
    "skills",
    "permissionMode",
    "color",
  ]);

  test("enumeration covers agents and skill bodies", () => {
    expect(agentFiles()).toContain("agents/researcher.md");
    expect(skillFiles()).toContain("skills/team/SKILL.md");
  });

  test("parser pin: the full key set is recovered from the block-scalar hard case", () => {
    const keys = frontmatterKeys(read(join(REPO_ROOT, "skills", "pr-approve-watch", "SKILL.md")));
    expect(keys.sort()).toEqual(
      ["name", "description", "effort", "argument-hint", "disable-model-invocation"].sort(),
    );
  });

  test("every skill frontmatter key is classified", () => {
    for (const file of skillFiles()) {
      const unclassified = frontmatterKeys(read(join(REPO_ROOT, file))).filter(
        (key) => !SKILL_KEYS.has(key),
      );
      expect({ file, unclassified }).toEqual({ file, unclassified: [] });
    }
  });

  test("every agent frontmatter key is classified", () => {
    for (const file of agentFiles()) {
      const unclassified = frontmatterKeys(read(join(REPO_ROOT, file))).filter(
        (key) => !AGENT_KEYS.has(key),
      );
      expect({ file, unclassified }).toEqual({ file, unclassified: [] });
    }
  });
});
