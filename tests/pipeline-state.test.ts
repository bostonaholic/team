// tests/pipeline-state.test.ts
//
// L1/L3 unit tests for the shared runtime-hook state lib
// hooks/lib/pipeline-state.mjs. The SessionStart and PreCompact hooks are thin
// wrappers over this lib; testing it here pins the discovery + phase-inference
// behavior once, deterministically, instead of leaving it duplicated and
// untested across two hooks. Hermetic: temp dirs + real fs; git is used only
// for the single IMPLEMENT case.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  ID_RE,
  findActiveTopic,
  inferPhase,
  readFrontmatter,
  worktreeMatches,
} from "../hooks/lib/pipeline-state.mjs";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "pipeline-state-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function planDir(id: string): string {
  const d = join(root, "docs", "plans", id);
  mkdirSync(d, { recursive: true });
  return d;
}
function seed(id: string, file: string, content = "", mtimeSec?: number): string {
  const d = planDir(id);
  const p = join(d, file);
  writeFileSync(p, content);
  if (mtimeSec !== undefined) utimesSync(p, mtimeSec, mtimeSec);
  return d;
}

describe("ID_RE", () => {
  test("accepts ticket- and date-prefixed kebab ids", () => {
    expect(ID_RE.test("ENG-1234-add-auth")).toBe(true);
    expect(ID_RE.test("2026-06-25-extract-discovery")).toBe(true);
  });
  test("rejects non-conforming names", () => {
    for (const bad of ["NotAnId", "docs", "-leading", "2026-6-1-x", "UPPER-1-X"]) {
      expect(ID_RE.test(bad)).toBe(false);
    }
  });
});

describe("readFrontmatter", () => {
  test("parses key: value pairs from the leading --- block", async () => {
    const d = seed("2026-01-01-x", "design.md", "---\napproved: true\ntopic: x\n---\nbody\n");
    const fm = await readFrontmatter(join(d, "design.md"));
    expect(fm.approved).toBe("true");
    expect(fm.topic).toBe("x");
  });
  test("returns {} with no frontmatter or a missing file", async () => {
    const d = seed("2026-01-01-y", "design.md", "no frontmatter here\n");
    expect(await readFrontmatter(join(d, "design.md"))).toEqual({});
    expect(await readFrontmatter(join(root, "nope.md"))).toEqual({});
  });
});

describe("worktreeMatches", () => {
  test("matches a worktree path whose basename is the id", () => {
    expect(
      worktreeMatches(["/repo/.claude/worktrees/2026-01-01-x"], "2026-01-01-x"),
    ).toBe(true);
    expect(worktreeMatches(["/repo"], "2026-01-01-x")).toBe(false);
  });
});

describe("findActiveTopic (home scan, non-git temp dir)", () => {
  test("returns the most-recently-touched conforming topic", async () => {
    seed("2026-01-01-older", "task.md", "", 1_000_000);
    const newer = seed("2026-01-02-newer", "research.md");
    const active = await findActiveTopic(root);
    expect(active?.id).toBe("2026-01-02-newer");
    expect(active?.dir).toBe(newer);
  });
  test("ignores non-ID_RE directories", async () => {
    seed("NotAnId", "task.md");
    expect(await findActiveTopic(root)).toBeNull();
  });
  test("returns null when docs/plans is absent", async () => {
    expect(await findActiveTopic(root)).toBeNull();
  });
});

describe("inferPhase (artifact-derived phases)", () => {
  const id = "2026-01-01-topic";
  test("WORKTREE when a worktree exists but no task.md", async () => {
    const d = planDir(id);
    expect(await inferPhase(d, root, id, true)).toBe("WORKTREE");
  });
  test("RESEARCH from task.md", async () => {
    const d = seed(id, "task.md");
    expect(await inferPhase(d, root, id, false)).toBe("RESEARCH");
  });
  test("DESIGN from research.md", async () => {
    const d = seed(id, "research.md");
    expect(await inferPhase(d, root, id, false)).toBe("DESIGN");
  });
  test("DESIGN when design.md is unapproved", async () => {
    const d = seed(id, "design.md", "---\napproved: false\n---\n");
    expect(await inferPhase(d, root, id, false)).toBe("DESIGN");
  });
  test("STRUCTURE when design.md is approved", async () => {
    const d = seed(id, "design.md", "---\napproved: true\n---\n");
    expect(await inferPhase(d, root, id, false)).toBe("STRUCTURE");
  });
  test("PLAN from structure.md", async () => {
    const d = seed(id, "structure.md");
    expect(await inferPhase(d, root, id, false)).toBe("PLAN");
  });
  test("null for an empty dir with no worktree", async () => {
    const d = planDir(id);
    expect(await inferPhase(d, root, id, false)).toBeNull();
  });
});

describe("inferPhase IMPLEMENT (real git signal)", () => {
  test("plan.md + a commit on branch <id> ahead of default => IMPLEMENT", async () => {
    const id = "2026-01-01-impl";
    const git = (...args: string[]) =>
      execFileSync("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "ignore"] });
    git("init", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    git("commit", "--allow-empty", "-m", "base");
    git("checkout", "-b", id);
    git("commit", "--allow-empty", "-m", "impl");
    const d = seed(id, "plan.md");
    expect(await inferPhase(d, root, id, false)).toBe("IMPLEMENT");
  });
});
