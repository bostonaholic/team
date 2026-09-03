import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  PHASE_FILES,
  designReviewPassed,
  resolveTopic,
} from "../skills/artifact-frontmatter/scripts/resolve-topic.mjs";

const roots: string[] = [];
const SCRIPT = join(
  import.meta.dir,
  "..",
  "skills",
  "artifact-frontmatter",
  "scripts",
  "resolve-topic.mjs",
);
const HOOKS = ["session-start-recover.mjs", "pre-compact-anchor.mjs"];
const DIRECTORY_CONSUMERS = [
  "eng-design-doc-review",
  "team-design",
  "team-implement",
  "team-plan",
  "team-pr",
  "team-research",
  "team-structure",
  "team-worktree",
];

function root(): string {
  const path = mkdtempSync(join(tmpdir(), "team-resolve-topic-"));
  roots.push(path);
  return path;
}

function topic(repo: string, id: string, artifact: string, mtime: Date): string {
  const directory = join(repo, "docs", "plans", id);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, artifact);
  writeFileSync(path, "---\nphase: fixture\n---\n");
  utimesSync(path, mtime, mtime);
  return directory;
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("resolve-topic", () => {
  test("uses only required phase artifacts for recency", () => {
    expect(PHASE_FILES).toEqual([
      "1-task",
      "2-questions",
      "5-research",
      "6-design",
      "7-structure",
      "8-plan",
    ]);
  });

  test("honors an existing explicit directory without applying discovery filters", async () => {
    const repo = root();
    mkdirSync(join(repo, "custom path"));
    expect(await resolveTopic({ rootDir: repo, argument: "custom path", predecessors: ["8-plan.md"] })).toMatchObject({
      status: "resolved",
      source: "explicit",
      id: "custom path",
      path: "custom path",
    });
  });

  test("selects the newest conforming topic with every predecessor", async () => {
    const repo = root();
    topic(repo, "2026-01-01-old", "5-research.md", new Date("2026-01-01"));
    topic(repo, "2026-01-02-new", "5-research.md", new Date("2026-01-02"));
    topic(repo, "not-an-id", "5-research.md", new Date("2026-01-03"));
    topic(repo, "2026-01-04-wrong", "2-questions.md", new Date("2026-01-04"));

    expect(await resolveTopic({ rootDir: repo, predecessors: ["5-research.md"] })).toMatchObject({
      status: "resolved",
      source: "discovered",
      id: "2026-01-02-new",
    });
  });

  test("falls back from an invalid explicit path and returns needs-input when no topic qualifies", async () => {
    const repo = root();
    expect(
      await resolveTopic({ rootDir: repo, argument: "missing", predecessors: ["8-plan.md"] }),
    ).toEqual({ status: "needs-input" });
  });

  test("uses the highest design-review round and fails closed", async () => {
    const repo = root();
    const directory = topic(repo, "2026-01-01-design", "6-design.md", new Date("2026-01-01"));
    writeFileSync(join(directory, "design-review-1.md"), "---\nverdict: APPROVE\n---\n");
    writeFileSync(
      join(directory, "design-review-2.md"),
      "---\nverdict: REQUEST CHANGES\n---\n",
    );
    expect(await designReviewPassed(directory)).toBe(false);
    expect(
      await resolveTopic({
        rootDir: repo,
        predecessors: ["6-design.md"],
        requireDesignReview: true,
      }),
    ).toEqual({ status: "needs-input" });
    writeFileSync(join(directory, "design-review-2.md"), "---\nverdict: COMMENT\n---\n");
    expect(await designReviewPassed(directory)).toBe(true);
  });

  test("CLI treats arguments as data and emits structured output", async () => {
    const repo = root();
    const directory = join(repo, "path; touch should-not-exist");
    mkdirSync(directory);
    const output = JSON.parse(
      execFileSync("node", [SCRIPT, "--root", repo, "--argument-stdin"], {
        input: directory,
        encoding: "utf8",
      }),
    );
    expect(output).toMatchObject({ status: "resolved", source: "explicit", absolutePath: directory });
    await expect(Bun.file(join(repo, "should-not-exist")).exists()).resolves.toBe(false);
    const argv = spawnSync("node", [SCRIPT, "--root", repo, "--argument", directory], {
      encoding: "utf8",
    });
    expect(argv.status).toBe(2);
    expect(argv.stderr).toContain("unknown argument: --argument");
  });

  test("every directory consumer passes optional arguments through stdin", () => {
    for (const skill of DIRECTORY_CONSUMERS) {
      const text = readFileSync(join(import.meta.dir, "..", "skills", skill, "SKILL.md"), "utf8");
      expect(text).toContain("--argument-stdin");
      expect(text).not.toContain('--argument "$ARGUMENTS"');
    }
  });

  test("both recovery hooks infer state through the shared implementation", () => {
    const repo = root();
    topic(repo, "2026-01-01-recovery", "2-questions.md", new Date("2026-01-01"));
    for (const hook of HOOKS) {
      const result = spawnSync("node", [join(import.meta.dir, "..", "hooks", hook)], {
        input: JSON.stringify({ cwd: repo }),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      const output = JSON.parse(result.stderr);
      expect(output.hookSpecificOutput.additionalContext).toContain("Phase: RESEARCH");
      expect(output.hookSpecificOutput.additionalContext).toContain("Id: 2026-01-01-recovery");
      expect(output.hookSpecificOutput.additionalContext).toContain("/team");
    }
  });
});
