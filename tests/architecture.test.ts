import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";

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

// Absence check: runs grep through execFileSync. A non-zero exit (grep found
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

  test("code-reviewer references reviewing-code/SKILL.md", () => {
    expect(read(CODE_REVIEWER)).toContain("reviewing-code/SKILL.md");
  });

  test("security-reviewer references reviewing-code/SKILL.md", () => {
    expect(read(SECURITY_REVIEWER)).toContain("reviewing-code/SKILL.md");
  });

  test("ux-reviewer references reviewing-code/SKILL.md", () => {
    expect(read(UX_REVIEWER)).toContain("reviewing-code/SKILL.md");
  });

  test("technical-writer references reviewing-code/SKILL.md", () => {
    expect(read(TECHNICAL_WRITER)).toContain("reviewing-code/SKILL.md");
  });

  test("inline Conventional Comments format definition removed from code-reviewer.md", () => {
    const re = /suggestion \(non-blocking\)|issue \(blocking\)|nitpick \(non-blocking\)/g;
    const count = read(CODE_REVIEWER).match(re)?.length ?? 0;
    expect(count).toBe(0);
  });

  test("verifier references neither the review front door nor its methodology", () => {
    // Both paths, because the checks runner must stay clear of the review
    // methodology wherever it lives and must not dispatch a reviewer either.
    expect(read(VERIFIER)).not.toContain("code-review/SKILL.md");
    expect(read(VERIFIER)).not.toContain("reviewing-code/SKILL.md");
  });

  test("reviewing-code row in docs/skills.md names all 4 consumer agents", () => {
    const row = filterRows(read(SKILLS_MD), "| `reviewing-code` |", /^#|^>|SKILL\.md|\/\/|event/);
    for (const agent of ["code-reviewer", "security-reviewer", "ux-reviewer", "technical-writer"]) {
      expect(row).toContain(agent);
    }
  });

  test("extraction threshold documented in docs/architecture.md", () => {
    expect(/extraction threshold/i.test(read(ARCHITECTURE_MD))).toBe(true);
  });

  test("extraction threshold pins the capability-vs-fragment rule (just-in-time loading)", () => {
    const text = read(ARCHITECTURE_MD);
    // An independently useful capability earns its own skill regardless of
    // consumer count — Claude Code preloads only skill metadata, so a small
    // skill is nearly free while embedding forecloses just-in-time loading.
    expect(text).toContain("regardless of consumer count");
    expect(/just-in-time/i.test(text)).toBe(true);
    expect(text).toContain("procedure fragment");
    // The consumer-count doctrine is gone: one referencer no longer forces
    // content to be embedded in its consumer.
    expect(text).not.toContain("2 or more consumers");
    expect(text).not.toContain("indirection without reuse");
  });

  test("implementer.md still loads solid", () => {
    expect(loadsSkill(read(IMPLEMENTER), "solid")).toBe(true);
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
    for (const directory of ["hooks", "skills", "agents", ".claude"]) {
      const files = execFileSync("git", ["ls-files", directory], {
        cwd: REPO_ROOT,
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .filter((file) => file && !file.includes("/worktrees/"));

      for (const file of files) {
        expect(read(join(REPO_ROOT, file))).not.toMatch(/\b(?:writeState|readState|initState)\s*\(/);
      }
    }
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

  test("recovery state reads docs/plans/ through the shared resolver (not ~/.team/)", () => {
    const resolver = read(
      join(REPO_ROOT, "skills", "artifact-frontmatter", "scripts", "resolve-topic.mjs"),
    );
    expect(/docs.*plans/.test(resolver)).toBe(true);
    expect(resolver).not.toContain("~/.team/");
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

  // Neither review loop stops on a count, and the Markdown sweep in
  // tests/protocol.test.ts cannot read JSON. A key that names a limit implies
  // a limit mechanism exists, so both keys are gone rather than nulled.
  test("registry.json has no maxRevisions field", () => {
    expect(grepAbsent(["-q", "maxRevisions", "skills/team/registry.json"])).toBe(true);
  });

  test("registry.json has no maxRetries field", () => {
    expect(grepAbsent(["-q", "maxRetries", "skills/team/registry.json"])).toBe(true);
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

  // Effort tracks the work, the same way model does, and nothing else pins a
  // per-agent effort level: a silent downgrade of a strategic author to `low`
  // passes every check above. EXPECTED_EFFORTS is the pin, mirroring
  // EXPECTED_MODELS in describe("model tiering") below.
  const EXPECTED_EFFORTS: Record<string, string> = {
    "code-reviewer": "high",
    "design-author": "high",
    "file-finder": "low",
    implementer: "high",
    planner: "high",
    questioner: "high",
    researcher: "medium",
    "security-reviewer": "high",
    "structure-planner": "high",
    "technical-writer": "low",
    "test-architect": "high",
    "ux-reviewer": "medium",
    verifier: "low",
  };

  // Takes frontmatter rather than an agent name, so a synthetic one can prove
  // the check reports what it claims to catch.
  function effortMismatch(agent: string, level: string, fm: string): string | null {
    if (new RegExp(`^effort: ${level}$`, "m").test(fm)) return null;
    return `${agent}: expected effort ${level}, got ${/^effort: (\S+)$/m.exec(fm)?.[1] ?? "none"}`;
  }

  test("EXPECTED_EFFORTS pins all 13 agents to their levels", () => {
    // Key-set equality both directions: a new agent missing from the map and a
    // stale map key both fail here. agentFiles() is already sorted.
    const names = agentFiles().map((file) => basename(file, ".md"));
    expect(Object.keys(EXPECTED_EFFORTS).sort()).toEqual(names);
    const offenders: string[] = [];
    for (const [agent, level] of Object.entries(EXPECTED_EFFORTS)) {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      const offender = effortMismatch(agent, level, fm);
      if (offender) offenders.push(offender);
    }
    expect(offenders).toEqual([]);
  });

  // Prove the pin can find a positive: a downgraded level and a dropped key.
  test("the effort pin can see planted violations", () => {
    expect(effortMismatch("planted-agent", "xhigh", "effort: low\n")).toBe(
      "planted-agent: expected effort xhigh, got low",
    );
    expect(effortMismatch("planted-agent", "xhigh", "model: opus\n")).toBe(
      "planted-agent: expected effort xhigh, got none",
    );
  });

  test("each agent's frontmatter carries exactly one effort: key", () => {
    // No trailing space in the pattern, so a stray `effort:low` counts too.
    const offenders: string[] = [];
    for (const file of agentFiles()) {
      const count = frontmatter(read(join(REPO_ROOT, file))).match(/^effort:/gm)?.length ?? 0;
      if (count !== 1) offenders.push(`${file}: ${count} effort: keys`);
    }
    expect(offenders).toEqual([]);
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

describe("model tiering", () => {
  // opus: complex work, and the default. Security review is complex work, so
  // `security-reviewer` sits on that rung like any other complex-work agent;
  // what keeps it there is the override recipe in docs/architecture.md, which
  // carries the vendor-classifier fact. sonnet: bounded judgment.
  // haiku: mechanical.
  const EXPECTED_MODELS: Record<string, string> = {
    "code-reviewer": "opus",
    "design-author": "opus",
    "file-finder": "haiku",
    implementer: "opus",
    planner: "opus",
    questioner: "sonnet",
    researcher: "opus",
    "security-reviewer": "opus",
    "structure-planner": "opus",
    "technical-writer": "sonnet",
    "test-architect": "opus",
    "ux-reviewer": "sonnet",
    verifier: "haiku",
  };

  test("EXPECTED_MODELS pins all 13 agents to their tiers", () => {
    // Key-set equality both directions: a new agent missing from the map and
    // a stale map key both fail here. agentFiles() is already sorted.
    const names = agentFiles().map((file) => basename(file, ".md"));
    expect(Object.keys(EXPECTED_MODELS).sort()).toEqual(names);
    for (const [agent, tier] of Object.entries(EXPECTED_MODELS)) {
      const fm = frontmatter(read(join(REPO_ROOT, "agents", `${agent}.md`)));
      expect(fm).toMatch(new RegExp(`^model: ${tier}$`, "m"));
    }
  });

  test("each agent's frontmatter carries exactly one model: key", () => {
    // No trailing space in the pattern, so a stray `model:fable` counts too.
    const offenders: string[] = [];
    for (const file of agentFiles()) {
      const count = frontmatter(read(join(REPO_ROOT, file))).match(/^model:/gm)?.length ?? 0;
      if (count !== 1) offenders.push(`${file}: ${count} model: keys`);
    }
    expect(offenders).toEqual([]);
  });

  test("no skill frontmatter carries a model: key", () => {
    const offenders: string[] = [];
    for (const file of skillFiles()) {
      if (/^model:/m.test(frontmatter(read(join(REPO_ROOT, file))))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("user-invocable trigger phrases", () => {
  // Extract the description field's text only from a frontmatter slice,
  // handling both YAML styles in use: single-line scalar
  // (`description: <text>`) and block scalar (`description: |` followed by
  // indented lines until the first non-indented line). Scoping to the
  // description prevents a false positive on the quoted `argument-hint`
  // value elsewhere in the frontmatter.
  function descriptionText(fm: string): string {
    const lines = fm.split("\n");
    const start = lines.findIndex((line) => line.startsWith("description:"));
    if (start === -1) return "";
    const inline = (lines[start] ?? "").slice("description:".length).trim();
    if (inline !== "" && inline !== "|") {
      // A fully-quoted inline scalar must be unwrapped: returned verbatim,
      // its surrounding quotes would make matchAll treat the whole value as
      // one "phrase" and pass with zero real trigger phrases. A quote that
      // opens but never closes on the line is an unsupported style — throw
      // rather than scan text that YAML would parse differently.
      const quote = inline[0];
      if (quote === '"' || quote === "'") {
        if (inline.length < 2 || !inline.endsWith(quote)) {
          throw new Error(`unsupported description scalar style: ${inline}`);
        }
        const body = inline.slice(1, -1);
        return quote === '"'
          ? body.replace(/\\"/g, '"')
          : body.replace(/''/g, "'");
      }
      return inline;
    }
    const block: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line === undefined || !/^\s+\S/.test(line)) break;
      block.push(line.trim());
    }
    return block.join(" ");
  }

  // Every skills/*/SKILL.md that does not set `user-invocable: false` is a
  // user-facing entry point and must carry routing triggers in its
  // description. Offenders are collected and asserted empty so a single run
  // names every non-conforming skill.
  function userInvocableSkills(): Array<{ file: string; description: string }> {
    return skillFiles()
      .map((file) => ({ file, fm: frontmatter(read(join(REPO_ROOT, file))) }))
      .filter(({ fm }) => !/^user-invocable: false$/m.test(fm))
      .map(({ file, fm }) => ({ file, description: descriptionText(fm) }));
  }

  test("every user-invocable skill description carries at least one double-quoted natural-language phrase", () => {
    // A phrase that starts with "/" is a slash trigger, not natural
    // language — it does not satisfy this check. No "Trigger on" carrier
    // sentence is required: shipit's explicit-intent guard wording carries
    // its quoted phrases and must pass as-is.
    const offenders: string[] = [];
    for (const { file, description } of userInvocableSkills()) {
      const phrases = [...description.matchAll(/"([^"]+)"/g)].flatMap((m) =>
        m[1] === undefined ? [] : [m[1]],
      );
      if (!phrases.some((phrase) => !phrase.startsWith("/"))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  test("every user-invocable skill description carries its own literal /<name>, prefix-safe", () => {
    // Prefix-safe: the occurrence must not be immediately followed by
    // another name character, so `/team-research` cannot satisfy the
    // `/team` requirement. Quote-style-agnostic: a backtick-quoted slash
    // name (eng-design-doc-review) passes.
    const offenders: string[] = [];
    for (const { file, description } of userInvocableSkills()) {
      const name = file.split("/")[1];
      const slashName = new RegExp(`/${name}(?![a-z0-9-])`);
      if (!slashName.test(description)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
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

  // The `8-plan.md` inference row must map to IMPLEMENT. Match the table row that
  // names `8-plan.md` and assert IMPLEMENT appears on that same row.
  const PLAN_ROW_IMPLEMENT = /^\|[^\n]*`8-plan\.md`[^\n]*\|[^\n]*IMPLEMENT[^\n]*\|/m;
  // No `8-plan.md` row may map to WORKTREE anymore.
  const PLAN_ROW_WORKTREE = /^\|[^\n]*`8-plan\.md`[^\n]*\|[^\n]*WORKTREE[^\n]*\|/m;

  for (const file of PROSE_TABLES) {
    test(`8-plan.md inference row maps to IMPLEMENT in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      const text = read(file);
      expect(text).toMatch(PLAN_ROW_IMPLEMENT);
      expect(PLAN_ROW_WORKTREE.test(text)).toBe(false);
    });
  }

  // A leading WORKTREE row whose signal is an existing worktree without
  // 1-task.md maps to WORKTREE. Assert the decision, not one prose rendering.
  const LEADING_WORKTREE_ROW = /^\|[^\n]*worktree[^\n]*(?:no|without)[^\n]*`?1-task\.md`?[^\n]*\|[^\n]*WORKTREE[^\n]*\|/im;

  for (const file of PROSE_TABLES) {
    test(`leading WORKTREE inference row present in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      expect(read(file)).toMatch(LEADING_WORKTREE_ROW);
    });
  }

  // IMPLEMENT requires both 8-plan.md and a branch commit since merge-base.
  const IMPLEMENT_EVIDENCE = /^\|[^\n]*`8-plan\.md`[^\n]*(?:commit|branch ahead)[^\n]*(?:merge-base|since)[^\n]*\|[^\n]*IMPLEMENT[^\n]*\|/im;

  for (const file of PROSE_TABLES) {
    test(`IMPLEMENT evidence requires a post-merge-base commit in ${file.replace(REPO_ROOT + "/", "")}`, () => {
      expect(read(file)).toMatch(IMPLEMENT_EVIDENCE);
    });
  }

  // ---- Slice 4: one executable recovery implementation -------------------
  test("both hooks import the canonical topic-state resolver", () => {
    for (const hook of ["session-start-recover.mjs", "pre-compact-anchor.mjs"]) {
      const source = read(join(REPO_ROOT, "hooks", hook));
      expect(source).toContain("../skills/artifact-frontmatter/scripts/resolve-topic.mjs");
      expect(source).not.toContain("const ID_RE");
    }
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

// Pipeline artifacts under docs/plans/<id>/ are per-run scratch: a topic's
// 1-task.md/6-design.md/8-plan.md describe one run's state, not the plugin. Tracking
// them puts one contributor's in-flight run in everyone's clone, and the site
// already excludes them (docs/_config.yml `exclude: plans`, and pages.yml skips
// docs/plans/** as a trigger path), so a tracked one ships nowhere and only
// creates merge conflicts between concurrent runs.
describe("pipeline scratch is never tracked", () => {
  test(".gitignore ignores docs/plans/", () => {
    const ignore = read(join(REPO_ROOT, ".gitignore"));
    // Guard: an unreadable/empty .gitignore must fail, not vacuously pass.
    expect(ignore.length).toBeGreaterThan(0);
    expect(/^docs\/plans\/$/m.test(ignore)).toBe(true);
  });

  // The .gitignore rule alone is not the invariant: git keeps tracking a file
  // that was already in the index, and `git add -f` bypasses the rule outright.
  // Ask the index directly. A spawn failure throws rather than reading as
  // "nothing tracked", so a broken check cannot pass for the wrong reason.
  test("no path under docs/plans/ is in the git index", () => {
    const tracked = execFileSync("git", ["ls-files", "--", "docs/plans"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(tracked.trim()).toBe("");
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
