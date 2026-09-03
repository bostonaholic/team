import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  findLatestTopic,
  ID_RE,
  inferPhase,
  implementationPassed,
  isTopicId,
  phaseAction,
  resolveArtifactDirectory,
} from "../skills/team/scripts/phase-state.mjs";

const roots: string[] = [];
const SCRIPT = join(process.cwd(), "skills", "team", "scripts", "phase-state.mjs");

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(id = "2026-09-03-state-contract") {
  const root = mkdtempSync(join(tmpdir(), "team-phase-state-"));
  roots.push(root);
  const dir = join(root, "docs", "plans", id);
  mkdirSync(dir, { recursive: true });
  return { root, dir, id };
}

function artifact(dir: string, name: string, phase: string, body = "", extra = "") {
  const topic = ID_RE.exec(basename(dir))?.[1];
  if (!topic) throw new Error(`Invalid fixture directory: ${dir}`);
  const phaseFields = phase === "task" ? "ticketId: null\n" : "";
  const content = phase === "task" && body === "" ? "## Request\nFixture request." : body;
  writeFileSync(
    join(dir, name),
    `---\ntopic: ${topic}\ndate: 2026-09-03\nphase: ${phase}\n${phaseFields}${extra}---\n\n${content}\n`,
  );
}

function completeThroughPlan(dir: string) {
  artifact(dir, "1-task.md", "task", "## Request\nBuild the requested feature.");
  artifact(dir, "2-questions.md", "questions");
  artifact(dir, "5-research.md", "research");
  artifact(dir, "6-design.md", "design", "", "revision: 0\n");
  artifact(dir, "design-review-1.md", "design-review", "", "verdict: APPROVE\n");
  artifact(dir, "7-structure.md", "structure");
  artifact(dir, "8-plan.md", "plan");
}

describe("Team phase-state resolver", () => {
  test("validates IDs and resolves only the requested directory", () => {
    const { root, dir, id } = fixture();
    mkdirSync(join(root, "docs", "plans", "2026-09-03-newer-topic"));

    expect(isTopicId(id)).toBe(true);
    expect(isTopicId("../state-contract")).toBe(false);
    expect(resolveArtifactDirectory(root, id)).toBe(dir);
    expect(resolveArtifactDirectory(root, "2026-09-03-missing-topic")).toBeNull();
  });

  test("CLI exposes exact resolve, not latest-topic selection", () => {
    const { root, dir, id } = fixture();
    const resolved = spawnSync("node", [SCRIPT, "resolve", root, id], {
      encoding: "utf8",
    });
    expect(resolved.status).toBe(0);
    expect(JSON.parse(resolved.stdout)).toMatchObject({ id, dir, phase: "WORKTREE" });

    const latest = spawnSync("node", [SCRIPT, "latest", root], {
      encoding: "utf8",
    });
    expect(latest.status).toBe(2);
    expect(latest.stderr).toContain("Usage:");
  });

  test("select permits only the first incomplete phase", () => {
    const { dir } = fixture();
    artifact(dir, "1-task.md", "task");

    expect(phaseAction("QUESTION", "worktree")).toEqual({
      action: "noop",
      current: "QUESTION",
      requested: "WORKTREE",
    });
    expect(phaseAction("QUESTION", "question")).toEqual({
      action: "run",
      current: "QUESTION",
      requested: "QUESTION",
    });
    expect(phaseAction("QUESTION", "research")).toEqual({
      action: "blocked",
      current: "QUESTION",
      requested: "RESEARCH",
    });
    expect(() => phaseAction("QUESTION", "unknown")).toThrow("Invalid phase");

    const blocked = spawnSync("node", [SCRIPT, "select", dir, "research"], {
      encoding: "utf8",
    });
    expect(blocked.status).toBe(4);
    expect(JSON.parse(blocked.stdout)).toMatchObject({
      action: "blocked",
      current: "QUESTION",
      requested: "RESEARCH",
    });

    const relative = spawnSync(
      "node",
      [SCRIPT, "select", join("docs", "plans", basename(dir)), "question"],
      { encoding: "utf8" },
    );
    expect(relative.status).toBe(2);
    expect(relative.stderr).toContain("Invalid artifact directory");
  });

  test("QRSPI recovery ignores team-fix artifact directories", () => {
    const { root, dir, id } = fixture("2026-09-03-team-fix-run");
    artifact(dir, "1-task.md", "task", "## Request\nFix the bug.", "workflow: team-fix\n");

    expect(findLatestTopic(root)).toBeNull();
    const resolved = spawnSync("node", [SCRIPT, "resolve", root, id], {
      encoding: "utf8",
    });
    expect(resolved.status).toBe(4);
    expect(resolved.stderr).toContain("belongs to another workflow");
  });

  test("infers the first incomplete phase in strict order", () => {
    const { dir } = fixture();
    const reviewedHead = "a".repeat(40);
    const prHead = "b".repeat(40);

    expect(inferPhase(dir)).toBe("WORKTREE");
    artifact(dir, "1-task.md", "task");
    expect(inferPhase(dir)).toBe("QUESTION");
    artifact(dir, "2-questions.md", "questions");
    expect(inferPhase(dir)).toBe("RESEARCH");
    artifact(dir, "5-research.md", "research");
    expect(inferPhase(dir)).toBe("DESIGN");
    artifact(dir, "6-design.md", "design", "", "revision: 0\n");
    expect(inferPhase(dir)).toBe("DESIGN");
    artifact(dir, "design-review-1.md", "design-review", "", "verdict: APPROVE\n");
    expect(inferPhase(dir)).toBe("STRUCTURE");
    artifact(dir, "7-structure.md", "structure");
    expect(inferPhase(dir)).toBe("PLAN");
    artifact(dir, "8-plan.md", "plan");
    expect(inferPhase(dir)).toBe("IMPLEMENT");
    artifact(
      dir,
      "9-implementation.md",
      "implementation",
      `## Verified heads\n- home: ${reviewedHead}`,
      "verdict: PASS\n",
    );
    expect(inferPhase(dir, () => reviewedHead)).toBe("PR");
    artifact(
      dir,
      "10-pr.md",
      "pr",
      `## Pull requests\n- home: https://github.com/acme/repo/pull/1\n\n## Heads\n- home: ${prHead}`,
      "status: opened\n",
    );
    expect(inferPhase(dir, () => prHead)).toBeNull();
    expect(inferPhase(dir, () => "c".repeat(40))).toBe("IMPLEMENT");
  });

  test("later artifacts cannot bypass a missing predecessor or design gate", () => {
    const { dir } = fixture();
    artifact(dir, "8-plan.md", "plan");
    expect(inferPhase(dir)).toBe("WORKTREE");

    writeFileSync(join(dir, "1-task.md"), "---\ntopic: state-contract\nphase: task\n");
    expect(inferPhase(dir)).toBe("WORKTREE");
    writeFileSync(
      join(dir, "1-task.md"),
      "---\ntopic: state-contract\nphase: task\nticketId: null\n---\n\n## Request\nTest\n",
    );
    expect(inferPhase(dir)).toBe("WORKTREE");
    artifact(dir, "1-task.md", "task");
    artifact(dir, "2-questions.md", "questions", "", "topic: wrong-topic\n");
    expect(inferPhase(dir)).toBe("QUESTION");
    artifact(dir, "2-questions.md", "questions");
    artifact(dir, "5-research.md", "research");
    artifact(dir, "6-design.md", "design");
    artifact(dir, "design-review-1.md", "design-review", "", "verdict: APPROVE\n");
    expect(inferPhase(dir)).toBe("DESIGN");
    artifact(dir, "6-design.md", "design", "", "revision: 0\n");
    expect(inferPhase(dir)).toBe("STRUCTURE");
  });

  test("task topic must match the exact directory ID", () => {
    const { dir } = fixture();
    artifact(dir, "1-task.md", "task", "", "topic: another-topic\n");
    expect(inferPhase(dir)).toBe("WORKTREE");
  });

  test("duplicate frontmatter fields fail closed", () => {
    const { dir } = fixture();
    artifact(dir, "1-task.md", "task", "", "topic: state-contract\n");
    expect(inferPhase(dir)).toBe("WORKTREE");
  });

  test("implementation PASS requires every current multi-repo HEAD", () => {
    const { dir } = fixture();
    completeThroughPlan(dir);
    const home = join(dir, "../../..");
    const companion = join(dir, "../../../companion");
    const homeHead = "a".repeat(40);
    const companionHead = "b".repeat(40);
    artifact(
      dir,
      "4-repos.md",
      "repos",
      `## Worktrees\n- home: ${home}\n- companion: ${companion}`,
    );
    artifact(
      dir,
      "9-implementation.md",
      "implementation",
      `## Verified heads\n- home: ${homeHead}\n- companion: ${companionHead}`,
      "verdict: PASS\n",
    );
    const heads = new Map([
      [home, homeHead],
      [companion, companionHead],
    ]);

    expect(implementationPassed(dir, (path: string) => heads.get(path) ?? null)).toBe(true);
    artifact(
      dir,
      "10-pr.md",
      "pr",
      `## Pull requests\n- home: https://github.com/acme/repo/pull/1\n\n## Heads\n- home: ${homeHead}`,
      "status: opened\n",
    );
    expect(inferPhase(dir, (path: string) => heads.get(path) ?? null)).toBe("PR");
    artifact(
      dir,
      "10-pr.md",
      "pr",
      `## Pull requests\n- home: https://github.com/acme/repo/pull/1\n\n## Heads\n- home: ${homeHead}\n- companion: ${companionHead}`,
      "status: opened\n",
    );
    expect(inferPhase(dir, (path: string) => heads.get(path) ?? null)).toBeNull();
    heads.set(companion, "c".repeat(40));
    expect(implementationPassed(dir, (path: string) => heads.get(path) ?? null)).toBe(false);
    expect(inferPhase(dir, (path: string) => heads.get(path) ?? null)).toBe("IMPLEMENT");
  });

  test("malformed multi-repo state never degrades to a home-only pass", () => {
    const { dir } = fixture();
    completeThroughPlan(dir);
    const homeHead = "a".repeat(40);
    artifact(dir, "4-repos.md", "repos", "## Worktrees\n- companion: relative/path");
    artifact(
      dir,
      "9-implementation.md",
      "implementation",
      `## Verified heads\n- home: ${homeHead}`,
      "verdict: PASS\n",
    );

    expect(implementationPassed(dir, () => homeHead)).toBe(false);
    expect(inferPhase(dir, () => homeHead)).toBe("IMPLEMENT");
  });

  test("latest-topic discovery skips newer completed runs", () => {
    const { root, dir } = fixture("2026-09-03-active-run");
    artifact(dir, "1-task.md", "task");

    const completed = join(root, "docs", "plans", "2026-09-03-completed-run");
    mkdirSync(completed, { recursive: true });
    completeThroughPlan(completed);
    const reviewedHead = "d".repeat(40);
    const prHead = "e".repeat(40);
    artifact(
      completed,
      "9-implementation.md",
      "implementation",
      `## Verified heads\n- home: ${reviewedHead}`,
      "verdict: PASS\n",
    );
    artifact(
      completed,
      "10-pr.md",
      "pr",
      `## Pull requests\n- home: https://github.com/acme/repo/pull/2\n\n## Heads\n- home: ${prHead}`,
      "status: opened\n",
    );

    expect(findLatestTopic(root, () => prHead)?.id).toBe("2026-09-03-active-run");
  });
});
