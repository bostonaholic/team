// tests/pr-watch-mechanics-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-watch-mechanics` RUNTIME
// watch-loop reference (skills/pr-watch-as-author/references/watch-loop.md) —
// the cycle timing, the 3-cycle soft cap, the handoff, and the three stop
// conditions that are loop mechanics rather than the action of any one watch.
// Both pr-watch-as-author and pr-watch-as-reviewer read it, so the numbers
// live here once instead of in two copies that drift.
//
// Every assertion is guarded so a not-yet-existing file yields a failed
// expect(), never an uncaught ENOENT.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { read } from "./helpers/text";

const REPO_ROOT = process.cwd();
const WATCH_LOOP = join(REPO_ROOT, "skills", "pr-watch-as-author", "references", "watch-loop.md");
const AUTHOR = join(REPO_ROOT, "skills", "pr-watch-as-author");
const REVIEWER = join(REPO_ROOT, "skills", "pr-watch-as-reviewer");

function body(): string {
  return existsSync(WATCH_LOOP) ? read(WATCH_LOOP) : "";
}
function flat(text: string): string {
  return text.replace(/\n/g, " ");
}

describe("watch-loop reference: ordinary-resource contract", () => {
  test("reference file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(WATCH_LOOP)).toBe(true);
  });

  test("reference is an ordinary file with no skill frontmatter", () => {
    expect(body().startsWith("---\n")).toBe(false);
  });
});

describe("watch-loop reference: the cycle contract", () => {
  test("the cycle wait is one backgrounded sleep-then-poll call, not foreground chunks", () => {
    // A foreground wait dies at the harness ceiling (600s in Claude Code) and
    // costs a turn per fragment. The cycle must emit one backgrounded call.
    const t = body();
    expect(t).toContain("sleep 1860");
    expect(t).toContain("run_in_background: true");
    expect(t).toContain("team/references/execution.md");
    expect(t).not.toContain("sleep 600");
  });

  test("the bound is 3 cycles and is declared with the loop", () => {
    const t = flat(body());
    expect(t).toContain("Soft cap: 3 cycles");
    expect(t).toContain("team/references/execution.md");
  });

  test("the soft cap hands off to the scheduled job and never self-re-arms", () => {
    const t = flat(body());
    expect(t).toContain("pr-watch.sh");
    expect(t).toContain("only on explicit user request");
  });

  test("owns the three stop conditions that are loop mechanics", () => {
    const t = flat(body());
    expect(t).toContain("User interrupt");
    expect(t).toContain("3 consecutive poll failures");
  });
});

describe("watch-loop reference: both watches read it", () => {
  // Guarded per-skill read: SKILL.md plus its numbered references, matching
  // how each watch skill's own tripwire assembles its body.
  function watchBody(dir: string): string {
    const skill = join(dir, "SKILL.md");
    const refs = join(dir, "references");
    if (!existsSync(skill) || !existsSync(refs)) return "";
    const { readdirSync } = require("node:fs");
    return [
      read(skill),
      ...readdirSync(refs)
        .filter((name: string) => /^\d\d-.*\.md$/.test(name))
        .sort()
        .map((name: string) => read(join(refs, name))),
    ].join("\n");
  }

  test("pr-watch-as-author reads the watch loop", () => {
    expect(watchBody(AUTHOR)).toContain("watch-loop.md");
  });

  test("pr-watch-as-reviewer reads the watch loop", () => {
    expect(watchBody(REVIEWER)).toContain("watch-loop.md");
  });

  test("neither watch restates the interval it delegates", () => {
    // The drift this extraction exists to prevent: one copy edited, one missed.
    expect(watchBody(AUTHOR)).not.toContain("sleep 1860");
    expect(watchBody(REVIEWER)).not.toContain("sleep 1860");
  });
});
