import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();

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

describe("effort tiering", () => {
  const EFFORT_LEVELS = /^effort: (low|medium|high|xhigh|max)$/m;

  test("every agent frontmatter has a valid effort level", () => {
    for (const file of agentFiles()) {
      const fm = frontmatter(read(join(REPO_ROOT, file)));
      expect(fm).toMatch(EFFORT_LEVELS);
    }
  });

  test("every effort field in skill frontmatter has a valid level", () => {
    for (const file of skillFiles()) {
      const fm = frontmatter(read(join(REPO_ROOT, file)));
      if (/^effort:/m.test(fm)) expect(fm).toMatch(EFFORT_LEVELS);
    }
  });

  test("every user-facing slash-command skill (has argument-hint) declares an effort level", () => {
    // A skill that takes arguments is a user-facing entry point, not a
    // methodology skill loaded by an agent — so it must pin its own effort.
    // Catches a newly added entry-point skill that forgot the field.
    for (const file of skillFiles()) {
      const fm = frontmatter(read(join(REPO_ROOT, file)));
      if (/^argument-hint:/m.test(fm)) expect(fm).toMatch(EFFORT_LEVELS);
    }
  });

  test("methodology skills carry no effort (it would override the loading agent's effort)", () => {
    for (const file of skillFiles()) {
      const fm = frontmatter(read(join(REPO_ROOT, file)));
      if (/^user-invocable: false$/m.test(fm)) {
        expect(/^effort:/m.test(fm)).toBe(false);
      }
    }
  });
});

describe("worktree-first pipeline", () => {
  // ---- Slice 4: phase-diagram sweep (6 files) -------------------------------
  // Each file carries a phase-diagram string. After the sweep, every one must
  // place Worktree before Question and must NOT carry a Plan-then-Worktree
  // ordering. Tolerate both Unicode `→` and ASCII `->` arrows, case-insensitive.
  // Shared regex iterated over the file list, mirroring EFFORT_LEVELS.
  const DIAGRAM_FILES = [
    join(REPO_ROOT, "README.md"),
    join(REPO_ROOT, "docs", "architecture.md"),
    join(REPO_ROOT, "docs", "index.md"),
    join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md"),
    join(REPO_ROOT, "skills", "team", "SKILL.md"),
    join(REPO_ROOT, "AGENTS.md"),
  ];

  // Worktree precedes Question, with the canonical phase order between them.
  // `[^\n]*` keeps the match on a single diagram line so a stray "Worktree"
  // paragraphs-away from "Question" cannot satisfy it.
  const WORKTREE_FIRST =
    /Worktree[^\n]*(?:→|->)[^\n]*Question[^\n]*(?:→|->)[^\n]*Research[^\n]*(?:→|->)[^\n]*Design[^\n]*(?:→|->)[^\n]*Structure[^\n]*(?:→|->)[^\n]*Plan[^\n]*(?:→|->)[^\n]*Implement[^\n]*(?:→|->)[^\n]*PR/i;

  // Old ordering: Plan immediately precedes Worktree on a diagram line.
  const PLAN_THEN_WORKTREE = /Plan[^\n]*(?:→|->)[^\n]*Worktree/i;

  for (const file of DIAGRAM_FILES) {
    test(`phase diagram is worktree-first in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      const text = read(file);
      expect(text).toMatch(WORKTREE_FIRST);
      expect(PLAN_THEN_WORKTREE.test(text)).toBe(false);
    });
  }

  // ---- Slice 4: prose inference tables (2 files) ---------------------------
  const PROSE_TABLES = [
    join(REPO_ROOT, "skills", "qrspi-workflow", "SKILL.md"),
    join(REPO_ROOT, "docs", "architecture.md"),
  ];

  // The `plan.md` inference row must map to IMPLEMENT. Match the table row that
  // names `plan.md` and assert IMPLEMENT appears on that same row.
  const PLAN_ROW_IMPLEMENT = /^\|[^\n]*`plan\.md`[^\n]*\|[^\n]*IMPLEMENT[^\n]*\|/m;
  // No `plan.md` row may map to WORKTREE anymore.
  const PLAN_ROW_WORKTREE = /^\|[^\n]*`plan\.md`[^\n]*\|[^\n]*WORKTREE[^\n]*\|/m;

  for (const file of PROSE_TABLES) {
    test(`plan.md inference row maps to IMPLEMENT in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      const text = read(file);
      expect(text).toMatch(PLAN_ROW_IMPLEMENT);
      expect(PLAN_ROW_WORKTREE.test(text)).toBe(false);
    });
  }

  // A leading WORKTREE row whose signal is "worktree exists" / "no task.md"
  // maps to WORKTREE. Match a single table row that mentions a worktree-exists
  // signal and maps to WORKTREE.
  const LEADING_WORKTREE_ROW = /^\|[^\n]*worktree exists[^\n]*\|[^\n]*WORKTREE[^\n]*\|/im;

  for (const file of PROSE_TABLES) {
    test(`leading WORKTREE inference row present in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      expect(read(file)).toMatch(LEADING_WORKTREE_ROW);
    });
  }

  // The IMPLEMENT confirmation phrase must be byte-for-byte identical in both
  // prose tables. The plan pins this verbatim string.
  const IMPLEMENT_PHRASE = "≥1 commit on `<id>` since merge-base";

  for (const file of PROSE_TABLES) {
    test(`IMPLEMENT confirmation phrase is verbatim in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      expect(read(file)).toContain(IMPLEMENT_PHRASE);
    });
  }

  // ---- Slice 4: hook shared-region byte-identity --------------------------
  // Locks the Slice 2 invariant. Extract the shared region from each hook —
  // from the `const ID_RE` line up to (not including) `async function main(` —
  // and assert the two extracted substrings are === equal.
  function sharedRegion(src: string): string {
    const start = src.indexOf("const ID_RE");
    const end = src.indexOf("async function main(");
    if (start < 0 || end < 0 || end <= start) {
      throw new Error("hook shared-region boundary markers not found");
    }
    return src.slice(start, end);
  }

  test("hooks share a byte-identical inference region", () => {
    const a = sharedRegion(read(join(REPO_ROOT, "hooks", "session-start-recover.mjs")));
    const b = sharedRegion(read(join(REPO_ROOT, "hooks", "pre-compact-anchor.mjs")));
    expect(a).toBe(b);
  });

  // ---- Slice 5: registry WORKTREE-first -----------------------------------
  test("registry.json lists WORKTREE as the first phase", () => {
    const reg = JSON.parse(read(join(REPO_ROOT, "skills", "team", "registry.json")));
    expect(reg.phases[0].name).toBe("WORKTREE");
  });

  // ---- Slices 1/3: no cp -r artifact-copy reference remains ----------------
  const NO_CP_FILES = [
    join(REPO_ROOT, "skills", "team", "SKILL.md"),
    join(REPO_ROOT, "skills", "team-worktree", "SKILL.md"),
    join(REPO_ROOT, "skills", "worktree-isolation", "SKILL.md"),
  ];

  for (const file of NO_CP_FILES) {
    test(`no cp -r artifact-copy reference in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      expect(read(file)).not.toContain("cp -r");
    });
  }

  // ---- Slice 3: worktree-isolation rationale is "why first" ----------------
  test("worktree-isolation rewrites rationale as Why first", () => {
    expect(read(join(REPO_ROOT, "skills", "worktree-isolation", "SKILL.md"))).toContain("Why first");
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

function skillFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "skills"))
    .sort()
    .map((n) => join("skills", n, "SKILL.md"))
    .filter((p) => existsSync(join(REPO_ROOT, p)));
}

function hookFiles(): string[] {
  return readdirSync(join(REPO_ROOT, "hooks"))
    .filter((n) => n.endsWith(".mjs"))
    .sort()
    .map((n) => join("hooks", n));
}
