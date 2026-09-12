// L3 in-process integration: the recovery hooks must read a limited-scope route
// from `1-task.md` and report completion instead of entering the feature phase
// table, so a finished plan/investigation/prototype never resumes into
// implementation, a commit, a push, or a PR. A legacy topic with no `route`
// metadata resumes through the phase table unchanged — missing metadata grants
// no new effect. Each case drives the real hook subprocess (node) against a
// disposable non-Git consumer directory; the hook's git probes degrade to an
// empty worktree set and `hasImplCommit` is false, exactly as the existing
// pipeline-recovery suite establishes.

import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PROCESS_TIMEOUT_MS = 15_000;
const HOOKS = ["session-start-recover.mjs", "pre-compact-anchor.mjs"];

function taskFile(id: string, route: string | null, routeStatus: string | null): string {
  return [
    "---",
    `topic: ${id}`,
    "date: 2026-01-01",
    "phase: task",
    ...(route ? [`route: ${route}`] : []),
    ...(routeStatus ? [`routeStatus: ${routeStatus}`] : []),
    "---",
    "",
    "# Route recovery fixture",
    "",
  ].join("\n");
}

function phaseFile(id: string, phase: string, revision = false): string {
  return [
    "---",
    `topic: ${id}`,
    "date: 2026-01-01",
    `phase: ${phase}`,
    ...(revision ? ["revision: 0"] : []),
    "---",
    "",
    "# Route recovery fixture",
    "",
  ].join("\n");
}

describe("limited-scope route recovery", () => {
  let owned: string[] = [];

  beforeAll(() => {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT, encoding: "utf8", timeout: PROCESS_TIMEOUT_MS, killSignal: "SIGKILL",
    });
    // Not fatal to the suite when HEAD is unavailable; the hook does not need it.
    void result;
  });

  afterEach(() => {
    const failures: unknown[] = [];
    for (const path of owned.splice(0)) {
      try {
        rmSync(path, { recursive: true, force: true });
        expect(existsSync(path), path).toBe(false);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, "Route fixture cleanup failed");
  });

  function consumer(): string {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "team-route-consumer-")));
    owned.push(directory);
    mkdirSync(join(directory, "docs", "plans"), { recursive: true });
    return directory;
  }

  function runHook(hook: string, cwd: string): string {
    const result = spawnSync("node", [join(ROOT, "hooks", hook)], {
      cwd,
      env: {
        ...process.env,
        HOME: cwd,
        TMPDIR: tmpdir(),
        LANG: "C",
        LC_ALL: "C",
        TZ: "UTC",
        GIT_CEILING_DIRECTORIES: realpathSync(tmpdir()),
      },
      input: JSON.stringify({ cwd }), encoding: "utf8",
      timeout: PROCESS_TIMEOUT_MS, killSignal: "SIGKILL",
    });
    expect(result.error, hook).toBeUndefined();
    expect(result.signal, hook).toBeNull();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout, hook).toBe("");
    const context = JSON.parse(result.stderr).hookSpecificOutput?.additionalContext;
    expect(typeof context, hook).toBe("string");
    return context;
  }

  function seed(id: string, route: string | null, routeStatus: string | null, extras: Array<[string, string]> = []): string {
    const cwd = consumer();
    const dir = join(cwd, "docs", "plans", id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "1-task.md"), taskFile(id, route, routeStatus));
    for (const [name, phase] of extras) writeFileSync(join(dir, name), phaseFile(id, phase));
    return cwd;
  }

  describe.each(HOOKS)("%s", (hook) => {
    test("a completed plan route reports COMPLETE, never implementation", () => {
      // `8-plan.md` is the very artifact the phase table would read as PLAN →
      // IMPLEMENT; the route metadata must win and report completion.
      const cwd = seed("GH-369-plan-done", "plan", "complete", [["8-plan.md", "plan"]]);
      const context = runHook(hook, cwd);

      expect(context).toContain("Phase: COMPLETE");
      expect(context).toContain("Route: plan — complete");
      expect(context).toContain("does not authorize implementation");
      expect(context).not.toContain("Phase: IMPLEMENT");
      expect(context).not.toContain("Phase: PLAN |");
    });

    test("a completed investigate route reports COMPLETE, never implementation", () => {
      const cwd = seed("GH-369-investigate-done", "investigate", "complete", [["5-research.md", "research"]]);
      const context = runHook(hook, cwd);

      expect(context).toContain("Phase: COMPLETE");
      expect(context).toContain("Route: investigate — complete");
      expect(context).not.toContain("Phase: IMPLEMENT");
      expect(context).not.toContain("Phase: DESIGN");
    });

    test("a completed prototype route reports COMPLETE, never implementation", () => {
      const cwd = seed("GH-369-prototype-done", "prototype", "complete", [["prototype-report.md", "task"]]);
      const context = runHook(hook, cwd);

      expect(context).toContain("Phase: COMPLETE");
      expect(context).toContain("Route: prototype — complete");
      expect(context).not.toContain("Phase: IMPLEMENT");
    });

    test("an in-progress plan route stays limited scope, not PLAN phase", () => {
      const cwd = seed("GH-369-plan-open", "plan", null);
      const context = runHook(hook, cwd);

      expect(context).toContain("Phase: PLAN |");
      expect(context).toContain("Route: plan — limited scope");
      expect(context).toContain("never implements, commits, pushes, or opens a PR");
      expect(context).not.toContain("Phase: IMPLEMENT");
    });

    test("an in-progress investigate route stays limited scope", () => {
      const cwd = seed("GH-369-investigate-open", "investigate", null);
      const context = runHook(hook, cwd);

      expect(context).toContain("Phase: INVESTIGATE |");
      expect(context).toContain("Route: investigate — limited scope");
      expect(context).not.toContain("Phase: IMPLEMENT");
    });

    test("a legacy topic with 8-plan.md and no route resumes at PLAN", () => {
      // Missing route metadata grants no new effect: the phase table still
      // reads 8-plan.md + 7-structure.md and reports PLAN, not COMPLETE.
      const cwd = seed("GH-369-legacy-plan", null, null, [
        ["2-questions.md", "question"],
        ["5-research.md", "research"],
        ["6-design.md", "design"],
        ["7-structure.md", "structure"],
        ["8-plan.md", "plan"],
      ]);
      const context = runHook(hook, cwd);

      expect(context).toContain("Phase: PLAN |");
      expect(context).not.toContain("Phase: COMPLETE");
      expect(context).not.toContain("limited scope");
    });
  });
});
