import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// Frontmatter slice: lines strictly between the first and second `---` markers.
function frontmatter(text: string): string {
  const lines = text.split("\n");
  let count = 0;
  const out: string[] = [];
  for (const line of lines) {
    if (/^---$/.test(line)) {
      count++;
      continue;
    }
    if (count === 1) out.push(line);
  }
  return out.join("\n");
}

// Keep lines containing `key`, drop lines matching the `exclude` regex, take
// the first 5, join. Isolates a single table row from a methodology doc.
function filterRows(text: string, key: string, exclude: RegExp): string {
  return text
    .split("\n")
    .filter((line) => line.includes(key))
    .filter((line) => !exclude.test(line))
    .slice(0, 5)
    .join("\n");
}

// Absence check: runs grep via execFileSync. A non-zero exit (grep found
// nothing) is the PASS and returns true; a zero exit (a match was found)
// returns false. grep's exit code 2 (a real error, e.g. unreadable path)
// re-throws so it cannot be a false pass.
function grepAbsent(args: string[]): boolean {
  try {
    execFileSync("grep", args, { cwd: REPO_ROOT, stdio: "pipe" });
    return false; // exit 0: a match was found
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 1) return true; // exit 1: no match -> absence holds
    throw err; // exit 2 or spawn failure: surface loudly
  }
}

describe("skill architecture", () => {
  const CODE_REVIEWER = join(REPO_ROOT, "agents", "code-reviewer.md");
  const SECURITY_REVIEWER = join(REPO_ROOT, "agents", "security-reviewer.md");
  const UX_REVIEWER = join(REPO_ROOT, "agents", "ux-reviewer.md");
  const TECHNICAL_WRITER = join(REPO_ROOT, "agents", "technical-writer.md");
  const VERIFIER = join(REPO_ROOT, "agents", "verifier.md");
  const IMPLEMENTER = join(REPO_ROOT, "agents", "implementer.md");
  const SKILLS_MD = join(REPO_ROOT, "docs", "skills.md");
  const ARCHITECTURE_MD = join(REPO_ROOT, "docs", "architecture.md");

  test("code-reviewer references code-review/SKILL.md", () => {
    expect(read(CODE_REVIEWER)).toContain("code-review/SKILL.md");
  });

  test("security-reviewer references code-review/SKILL.md", () => {
    expect(read(SECURITY_REVIEWER)).toContain("code-review/SKILL.md");
  });

  test("ux-reviewer references code-review/SKILL.md", () => {
    expect(read(UX_REVIEWER)).toContain("code-review/SKILL.md");
  });

  test("technical-writer references code-review/SKILL.md", () => {
    expect(read(TECHNICAL_WRITER)).toContain("code-review/SKILL.md");
  });

  test("inline Conventional Comments format definition removed from code-reviewer.md", () => {
    const re = /suggestion \(non-blocking\)|issue \(blocking\)|nitpick \(non-blocking\)/g;
    const count = read(CODE_REVIEWER).match(re)?.length ?? 0;
    expect(count).toBe(0);
  });

  test("verifier does NOT reference code-review/SKILL.md", () => {
    expect(read(VERIFIER)).not.toContain("code-review/SKILL.md");
  });

  test("code-review row in docs/skills.md names all 4 consumer agents", () => {
    const row = filterRows(read(SKILLS_MD), "`code-review`", /^#|^>|SKILL\.md|\/\/|event/);
    for (const agent of ["code-reviewer", "security-reviewer", "ux-reviewer", "technical-writer"]) {
      expect(row).toContain(agent);
    }
  });

  test("extraction threshold documented in docs/architecture.md", () => {
    expect(/extraction threshold/i.test(read(ARCHITECTURE_MD))).toBe(true);
  });

  test("soft limit of 3 methodology skills documented in docs/architecture.md", () => {
    expect(/soft limit.*3|3 methodology skills/i.test(read(ARCHITECTURE_MD))).toBe(true);
  });

  test("implementer.md still references solid-principles/SKILL.md", () => {
    expect(read(IMPLEMENTER)).toContain("solid-principles/SKILL.md");
  });

  test("technical-writer.md still references writing-prose/SKILL.md", () => {
    expect(read(TECHNICAL_WRITER)).toContain("writing-prose/SKILL.md");
  });

  test("registry sync hook reports no mismatches", () => {
    // The hook reads a PostToolUse Write|Edit payload from stdin and writes
    // mismatches to stderr. Capture stderr; "mismatch" anywhere is a failure.
    // The hook may exit non-zero — a non-zero exit that produced no "mismatch"
    // stderr is still a PASS. A missing `node` binary throws (fail-loud).
    const hook = join(REPO_ROOT, ".claude", "hooks", "check-registry-sync.mjs");
    const payload = JSON.stringify({
      tool_name: "Write",
      tool_input: { file_path: join(REPO_ROOT, "agents", "code-reviewer.md") },
    });
    let stderr = "";
    try {
      execFileSync("node", [hook], {
        cwd: REPO_ROOT,
        input: payload,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; code?: string };
      if (e.code === "ENOENT") throw err; // node binary missing — fail loud
      stderr = `${e.stderr ?? ""}${e.stdout ?? ""}`;
    }
    expect(stderr).not.toContain("mismatch");
  });
});

describe("simplify orchestration scope fence", () => {
  test("lib/state.mjs no longer exists", () => {
    expect(existsSync(join(REPO_ROOT, "lib", "state.mjs"))).toBe(false);
  });

  test("no source files import lib/state (excluding docs/plans/)", () => {
    expect(
      grepAbsent(["-rn", "--exclude-dir=worktrees", "lib/state", "hooks/", "skills/", "agents/", ".claude/"]),
    ).toBe(true);
  });

  test("no active code references writeState/readState/initState (excluding docs/plans/)", () => {
    expect(
      grepAbsent([
        "-rEn",
        "--exclude-dir=worktrees",
        "writeState|readState|initState",
        "hooks/",
        "skills/",
        "agents/",
        ".claude/",
      ]),
    ).toBe(true);
  });

  test("no active code (mjs/json) references ~/.team or state.json filename", () => {
    expect(
      grepAbsent([
        "-rEn",
        "--exclude-dir=worktrees",
        "--include=*.mjs",
        "--include=*.json",
        "~/\\.team|state\\.json",
        "hooks/",
        "skills/",
        "agents/",
        ".claude/",
      ]),
    ).toBe(true);
  });

  test("hooks/pre-compact-anchor.mjs parses with node --check", () => {
    expect(() =>
      execFileSync("node", ["--check", join(REPO_ROOT, "hooks", "pre-compact-anchor.mjs")], {
        cwd: REPO_ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  test("hooks/session-start-recover.mjs parses with node --check", () => {
    expect(() =>
      execFileSync("node", ["--check", join(REPO_ROOT, "hooks", "session-start-recover.mjs")], {
        cwd: REPO_ROOT,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  test("pre-compact-anchor reads docs/plans/ (not ~/.team/)", () => {
    expect(/docs.*plans/.test(read(join(REPO_ROOT, "hooks", "pre-compact-anchor.mjs")))).toBe(true);
  });

  test("session-start-recover reads docs/plans/ (not ~/.team/)", () => {
    expect(/docs.*plans/.test(read(join(REPO_ROOT, "hooks", "session-start-recover.mjs")))).toBe(true);
  });

  test("no hook imports homedir from node:os", () => {
    expect(grepAbsent(["-E", "\\bhomedir\\b", ...hookFiles()])).toBe(true);
  });

  test("no agent frontmatter contains consumes:", () => {
    expect(grepAbsent(["-lE", "^consumes:", ...agentFiles()])).toBe(true);
  });

  test("no agent frontmatter contains produces:", () => {
    expect(grepAbsent(["-lE", "^produces:", ...agentFiles()])).toBe(true);
  });

  test("no agent frontmatter contains phase: (Claude Code does not support custom fields)", () => {
    // For each agents/*.md, slice the frontmatter and assert no `^phase:`
    // line. Fails loudly on any match.
    for (const file of agentFiles()) {
      const fm = frontmatter(read(join(REPO_ROOT, file)));
      expect(/^phase:/m.test(fm)).toBe(false);
    }
  });

  test("registry.json has no passEvent fields", () => {
    expect(grepAbsent(["-q", "passEvent", "skills/team/registry.json"])).toBe(true);
  });

  test("registry.json agents array still has 13 entries", () => {
    const reg = JSON.parse(read(join(REPO_ROOT, "skills", "team", "registry.json")));
    expect(reg.agents.length).toBe(13);
  });

  test("every registry agent has a phase field (registry is the source of truth)", () => {
    const reg = JSON.parse(read(join(REPO_ROOT, "skills", "team", "registry.json")));
    expect(reg.agents.filter((a: { phase?: unknown }) => a.phase != null).length).toBe(13);
  });

  test("no active code references .md.approved sidecar file paths", () => {
    expect(
      grepAbsent(["-rEn", "--exclude-dir=worktrees", "\\.md\\.approved", "skills/", "agents/", "hooks/", ".claude/"]),
    ).toBe(true);
  });

  test("docs/architecture.md does not describe writeState/readState/initState as live API", () => {
    expect(grepAbsent(["-E", "(writeState|readState|initState)\\(", "docs/architecture.md"])).toBe(true);
  });
});

// Resolve `agents/*.md` and `hooks/*.mjs` globs, returning repo-relative paths
// so grep receives the same file list a shell glob would expand to.
function agentFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "agents"))
    .filter((n) => n.endsWith(".md"))
    .sort()
    .map((n) => join("agents", n));
}

function hookFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "hooks"))
    .filter((n) => n.endsWith(".mjs"))
    .sort()
    .map((n) => join("hooks", n));
}
