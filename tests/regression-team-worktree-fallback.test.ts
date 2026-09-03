import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createWorktrees,
  parseRepoInventory,
  parseWorktreeSection,
} from "../skills/team-worktree/scripts/create-worktrees.mjs";

const SCRIPT = join(
  import.meta.dir,
  "..",
  "skills",
  "team-worktree",
  "scripts",
  "create-worktrees.mjs",
);
const IMPLEMENT_SKILL = join(
  import.meta.dir,
  "..",
  "skills",
  "team-implement",
  "SKILL.md",
);
const TEAM_SKILL = join(import.meta.dir, "..", "skills", "team", "SKILL.md");
const WORKTREE_SKILL = join(
  import.meta.dir,
  "..",
  "skills",
  "team-worktree",
  "SKILL.md",
);

setDefaultTimeout(15_000);

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.email=test@test", "-c", "user.name=test", ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function initRepo(path: string): void {
  mkdirSync(path);
  git(path, "init", "-b", "main");
  git(path, "commit", "--allow-empty", "-m", "init");
}

function reposMarkdown(
  homePath: string,
  additional: Array<[name: string, path: string]>,
  worktrees: Array<[name: string, path: string]>,
): string {
  const lines = [
    "## Home repo",
    "- **name:** home",
    `- **path:** ${homePath}`,
    "- **role:** home",
    "",
    "## Additional repos",
  ];
  for (const [name, path] of additional) {
    lines.push(
      `- **name:** ${name}`,
      `  **path:** ${path}`,
      `  **role:** ${name}`,
    );
  }
  lines.push("", "## Worktrees");
  for (const [name, path] of worktrees) lines.push(`- ${name}: ${path}`);
  return lines.join("\n") + "\n";
}

describe("team-worktree creation fallback", () => {
  test("the coordinator rebuilds WORKTREE evidence before resumed phases", () => {
    const body = readFileSync(TEAM_SKILL, "utf8");
    const text = body.replace(/\s+/g, " ");
    const worktree = text.indexOf("`team-worktree` in home-only mode");
    const rebuild = text.indexOf("Rebuild progress from files");
    const expansion = text.indexOf("`team-worktree` again for all declared repos");
    expect(text).toContain("Use the sole artifact-bearing location");
    expect(text).toContain("If both contain it, stop");
    expect(text).toContain("including on resume");
    expect(text).toContain("Home-only mode ignores `4-repos.md`");
    expect(readFileSync(WORKTREE_SKILL, "utf8")).toContain(
      "exactly one `## Worktrees` section",
    );
    expect(readFileSync(WORKTREE_SKILL, "utf8")).toContain(
      "including a standalone rerun",
    );
    expect(worktree).toBeGreaterThan(-1);
    expect(rebuild).toBeGreaterThan(worktree);
    expect(expansion).toBeGreaterThan(rebuild);
  });

  test("the composed implement phase honors recorded pipeline fallbacks", () => {
    const text = readFileSync(IMPLEMENT_SKILL, "utf8").replace(/\s+/g, " ");
    expect(text).toContain("use `/team`'s current WORKTREE result");
    expect(text).toContain("Standalone, call the");
    expect(text).toContain("rebuild that result");
    expect(text).toContain("A linked non-default checkout or a home creation fallback");
    expect(text).toContain("Do not infer a fallback from a path or artifact alone");
    expect(text).toContain("proceeds without another prompt");
    expect(text).toContain("Otherwise use `AskUserQuestion`");
  });

  test("parses one exact Worktrees inventory outside fenced examples", () => {
    const valid = [
      "```markdown",
      "## Worktrees",
      "- ignored: /tmp/ignored",
      "```",
      "## Worktrees",
      "- home: /tmp/home",
      "- secondary: /tmp/secondary ",
    ].join("\n");
    expect(Object.fromEntries(parseWorktreeSection(valid, ["home", "secondary"]))).toEqual(
      {
        home: "/tmp/home",
        secondary: "/tmp/secondary ",
      },
    );
    expect(() =>
      parseWorktreeSection("## Worktrees\n- home: /a\n## Worktrees\n- home: /a", [
        "home",
      ]),
    ).toThrow("multiple Worktrees sections");
    expect(() =>
      parseWorktreeSection("## Worktrees\n- home: /a\n- home: /b", ["home"]),
    ).toThrow("duplicate Worktrees entry: home");
    expect(() =>
      parseWorktreeSection("## Worktrees\n- home: /a", ["home", "secondary"]),
    ).toThrow("missing Worktrees entry: secondary");
    expect(() =>
      parseWorktreeSection("## Worktrees\n- home: /a\n- extra: /b", ["home"]),
    ).toThrow("unknown Worktrees entry: extra");

    expect(
      parseRepoInventory(
        reposMarkdown(
          "/tmp/home",
          [["secondary", "/tmp/secondary"]],
          [
            ["home", "/tmp/home-worktree"],
            ["secondary", "/tmp/secondary-worktree"],
          ],
        ),
      ),
    ).toEqual({
      home: { name: "home", path: "/tmp/home", role: "home" },
      additional: [
        { name: "secondary", path: "/tmp/secondary", role: "secondary" },
      ],
    });
  });

  test("anchors secondary containment to a linked home's primary checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-linked-home-"));
    const homeRepo = join(root, "home");
    const linkedHome = join(root, "linked-home");
    const secondaryRepo = join(root, "secondary");
    const branch = "feature-work";
    initRepo(homeRepo);
    initRepo(secondaryRepo);
    git(homeRepo, "worktree", "add", linkedHome, "-b", "existing-work");

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          linkedHome,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject([
        {
          name: "secondary",
          status: "created",
          path: realpathSync(join(secondaryRepo, ".claude", "worktrees", branch)),
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a target omitted from the declared repo inventory before mutation", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-missing-target-"));
    const homeRepo = join(root, "home");
    const secondaryRepo = join(root, "secondary");
    const reposFile = join(root, "4-repos.md");
    initRepo(homeRepo);
    initRepo(secondaryRepo);
    writeFileSync(
      reposFile,
      reposMarkdown(
        homeRepo,
        [["secondary", secondaryRepo]],
        [
          ["home", homeRepo],
          ["secondary", secondaryRepo],
        ],
      ),
    );

    try {
      expect(() =>
        createWorktrees(
          [{ name: "home", repo: homeRepo }],
          "feature-work",
          homeRepo,
          null,
          reposFile,
        ),
      ).toThrow("target inventory does not match 4-repos.md");
      expect(existsSync(join(homeRepo, ".claude", "worktrees", "feature-work"))).toBe(
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("uses the failed repo's primary checkout and still creates later worktrees", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-fallback-"));
    const failedRepo = join(root, "failed");
    const healthyRepo = join(root, "healthy");
    const branch = "feature-work";
    initRepo(failedRepo);
    initRepo(healthyRepo);
    git(failedRepo, "branch", branch);

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          failedRepo,
          "--target",
          "failed",
          failedRepo,
          "--target",
          "healthy",
          healthyRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      const outcomes = JSON.parse(result.stdout);
      expect(outcomes).toMatchObject([
        {
          name: "failed",
          status: "fallback",
          path: realpathSync(failedRepo),
          branch: "main",
          requestedBranch: branch,
          message:
            "Worktree creation failed in failed. Falling back to main tree for that repo.",
        },
        {
          name: "healthy",
          status: "created",
          path: realpathSync(join(healthyRepo, ".claude", "worktrees", branch)),
        },
      ]);
      expect(git(healthyRepo, "worktree", "list", "--porcelain")).toContain(
        join(healthyRepo, ".claude", "worktrees", branch),
      );
      expect(git(failedRepo, "worktree", "list", "--porcelain")).not.toContain(
        join(failedRepo, ".claude", "worktrees", branch),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps a durable home fallback when a later worktree retry could succeed", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-fallback-rerun-"));
    const homeRepo = join(root, "home");
    const secondaryRepo = join(root, "secondary");
    const branch = "feature-work";
    const artifactDir = join(homeRepo, "docs", "plans", branch);
    initRepo(homeRepo);
    initRepo(secondaryRepo);
    git(homeRepo, "branch", branch);

    try {
      const first = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--target",
          "home",
          homeRepo,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );
      expect(first.status).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject([
        { name: "home", status: "fallback", path: realpathSync(homeRepo) },
        { name: "secondary", status: "created" },
      ]);

      mkdirSync(artifactDir, { recursive: true });
      writeFileSync(join(artifactDir, "1-task.md"), "durable state\n");
      git(homeRepo, "branch", "-D", branch);

      const rerun = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--preserve-existing-home",
          artifactDir,
          "--target",
          "home",
          homeRepo,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );
      expect(rerun.status).toBe(0);
      expect(JSON.parse(rerun.stdout)).toMatchObject([
        {
          name: "home",
          status: "fallback",
          path: realpathSync(homeRepo),
          preserved: true,
          error: null,
        },
        { name: "secondary", status: "reused" },
      ]);
      expect(readFileSync(join(artifactDir, "1-task.md"), "utf8")).toBe("durable state\n");
      expect(existsSync(join(homeRepo, ".claude", "worktrees", branch))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("keeps a recorded secondary fallback when a later retry could succeed", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-secondary-rerun-"));
    const homeRepo = join(root, "home");
    const secondaryRepo = join(root, "secondary");
    const branch = "feature-work";
    initRepo(homeRepo);
    initRepo(secondaryRepo);
    git(secondaryRepo, "branch", branch);

    try {
      const first = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--target",
          "home",
          homeRepo,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );
      expect(first.status).toBe(0);
      expect(JSON.parse(first.stdout)).toMatchObject([
        { name: "home", status: "created" },
        { name: "secondary", status: "fallback", path: realpathSync(secondaryRepo) },
      ]);

      writeFileSync(join(secondaryRepo, "implementation.txt"), "durable change\n");
      git(secondaryRepo, "branch", "-D", branch);
      const reposFile = join(root, "4-repos.md");
      writeFileSync(
        reposFile,
        reposMarkdown(
          homeRepo,
          [["secondary", secondaryRepo]],
          [
            ["home", join(homeRepo, ".claude", "worktrees", branch)],
            ["secondary", secondaryRepo],
          ],
        ),
      );
      const rerun = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--recover-worktrees",
          reposFile,
          "--target",
          "home",
          homeRepo,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );

      expect(rerun.status).toBe(0);
      expect(JSON.parse(rerun.stdout)).toMatchObject([
        { name: "home", status: "reused" },
        {
          name: "secondary",
          status: "fallback",
          path: realpathSync(secondaryRepo),
          preserved: true,
          error: null,
        },
      ]);
      expect(readFileSync(join(secondaryRepo, "implementation.txt"), "utf8")).toBe(
        "durable change\n",
      );
      expect(existsSync(join(secondaryRepo, ".claude", "worktrees", branch))).toBe(
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a recorded fallback that is not the named primary checkout", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-recorded-mismatch-"));
    const homeRepo = join(root, "home");
    const secondaryRepo = join(root, "secondary");
    const otherRepo = join(root, "other");
    initRepo(homeRepo);
    initRepo(secondaryRepo);
    initRepo(otherRepo);
    const recordedHome = join(homeRepo, ".claude", "worktrees", "recorded-home");
    git(homeRepo, "worktree", "add", recordedHome, "-b", "recorded-home");
    const reposFile = join(root, "4-repos.md");
    writeFileSync(
      reposFile,
      reposMarkdown(
        homeRepo,
        [["secondary", secondaryRepo]],
        [
          ["home", recordedHome],
          ["secondary", otherRepo],
        ],
      ),
    );

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          "feature-work",
          "--home",
          homeRepo,
          "--recover-worktrees",
          reposFile,
          "--target",
          "home",
          homeRepo,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        "recorded worktree secondary belongs to another repository",
      );
      expect(git(secondaryRepo, "worktree", "list", "--porcelain")).not.toContain(
        join(secondaryRepo, ".claude", "worktrees", "feature-work"),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a recorded fallback with a competing branch worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-recorded-branch-"));
    const homeRepo = join(root, "home");
    const secondaryRepo = join(root, "secondary");
    const linked = join(root, "linked-secondary");
    initRepo(homeRepo);
    initRepo(secondaryRepo);
    git(secondaryRepo, "worktree", "add", linked, "-b", "feature-work");
    const recordedHome = join(homeRepo, ".claude", "worktrees", "recorded-home");
    git(homeRepo, "worktree", "add", recordedHome, "-b", "recorded-home");
    const reposFile = join(root, "4-repos.md");
    writeFileSync(
      reposFile,
      reposMarkdown(
        homeRepo,
        [["secondary", secondaryRepo]],
        [
          ["home", recordedHome],
          ["secondary", secondaryRepo],
        ],
      ),
    );

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          "feature-work",
          "--home",
          homeRepo,
          "--recover-worktrees",
          reposFile,
          "--target",
          "home",
          homeRepo,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        "recorded fallback secondary conflicts with an existing feature-work worktree",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a recovered linked checkout with a competing branch worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-recorded-linked-branch-"));
    const homeRepo = join(root, "home");
    const secondaryRepo = join(root, "secondary");
    const recordedSecondary = join(root, "recorded-secondary");
    const competing = join(root, "competing-secondary");
    initRepo(homeRepo);
    initRepo(secondaryRepo);
    git(secondaryRepo, "worktree", "add", recordedSecondary, "-b", "other-work");
    git(secondaryRepo, "worktree", "add", competing, "-b", "feature-work");
    const recordedHome = join(homeRepo, ".claude", "worktrees", "recorded-home");
    git(homeRepo, "worktree", "add", recordedHome, "-b", "recorded-home");
    const reposFile = join(root, "4-repos.md");
    writeFileSync(
      reposFile,
      reposMarkdown(
        homeRepo,
        [["secondary", secondaryRepo]],
        [
          ["home", recordedHome],
          ["secondary", recordedSecondary],
        ],
      ),
    );

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          "feature-work",
          "--home",
          homeRepo,
          "--recover-worktrees",
          reposFile,
          "--target",
          "home",
          homeRepo,
          "--target",
          "secondary",
          secondaryRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        "recorded fallback secondary conflicts with an existing feature-work worktree",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a preserved home fallback with a competing branch worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-home-branch-"));
    const homeRepo = join(root, "home");
    const linked = join(root, "linked-home");
    const branch = "feature-work";
    const artifactDir = join(homeRepo, "docs", "plans", branch);
    initRepo(homeRepo);
    mkdirSync(artifactDir, { recursive: true });
    git(homeRepo, "worktree", "add", linked, "-b", branch);

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--preserve-existing-home",
          artifactDir,
          "--target",
          "home",
          homeRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(
        "recorded fallback home conflicts with an existing feature-work worktree",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("validates every destination before creating any worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-destination-preflight-"));
    const homeRepo = join(root, "home");
    const invalidRepo = join(root, "invalid");
    const otherRepo = join(root, "other");
    const branch = "feature-work";
    initRepo(homeRepo);
    initRepo(invalidRepo);
    initRepo(otherRepo);
    const invalidDestination = join(invalidRepo, ".claude", "worktrees", branch);
    mkdirSync(join(invalidRepo, ".claude", "worktrees"), { recursive: true });
    git(otherRepo, "worktree", "add", invalidDestination, "-b", branch);

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--target",
          "home",
          homeRepo,
          "--target",
          "invalid",
          invalidRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("existing worktree does not match");
      expect(existsSync(join(homeRepo, ".claude", "worktrees", branch))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a symlink in the destination ancestry", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-destination-symlink-"));
    const homeRepo = join(root, "home");
    const outside = join(root, "outside");
    initRepo(homeRepo);
    mkdirSync(outside);
    symlinkSync(outside, join(homeRepo, ".claude"));

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          "feature-work",
          "--home",
          homeRepo,
          "--target",
          "home",
          homeRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("unsafe destination symlink");
      expect(existsSync(join(outside, "worktrees", "feature-work"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("supports a primary checkout whose basename ends in whitespace", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-whitespace-"));
    const homeRepo = join(root, "home \r");
    const branch = "feature-work";
    initRepo(homeRepo);

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--target",
          "home",
          homeRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject([
        {
          name: "home",
          status: "created",
          path: realpathSync(join(homeRepo, ".claude", "worktrees", branch)),
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not preserve a file at the expected artifact-directory path", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-artifact-file-"));
    const homeRepo = join(root, "home");
    const branch = "feature-work";
    const artifactPath = join(homeRepo, "docs", "plans", branch);
    initRepo(homeRepo);
    mkdirSync(join(homeRepo, "docs", "plans"), { recursive: true });
    writeFileSync(artifactPath, "not a directory\n");

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--preserve-existing-home",
          artifactPath,
          "--target",
          "home",
          homeRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject([
        { name: "home", status: "created" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("does not treat repository inspection errors as creation fallbacks", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-invalid-repo-"));
    const missingRepo = join(root, "missing");

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          "feature-work",
          "--home",
          missingRepo,
          "--target",
          "missing",
          missingRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("home must be an existing repository root");
      expect(result.stderr).not.toContain("Falling back");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("validates every target's sibling containment before creating any worktree", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-containment-"));
    const homeRepo = join(root, "home");
    const healthyRepo = join(root, "healthy");
    const nestedRoot = join(root, "nested");
    const outsideRepo = join(nestedRoot, "outside");
    initRepo(homeRepo);
    initRepo(healthyRepo);
    mkdirSync(nestedRoot);
    initRepo(outsideRepo);

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          "feature-work",
          "--home",
          homeRepo,
          "--target",
          "healthy",
          healthyRepo,
          "--target",
          "outside",
          outsideRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("is not a sibling of the home repo");
      expect(git(healthyRepo, "worktree", "list", "--porcelain")).not.toContain(
        realpathSync(healthyRepo) + "/.claude/worktrees/feature-work",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an expected path that belongs to another repository", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-wrong-repo-"));
    const homeRepo = join(root, "home");
    const targetRepo = join(root, "target");
    const otherRepo = join(root, "other");
    const branch = "feature-work";
    initRepo(homeRepo);
    initRepo(targetRepo);
    initRepo(otherRepo);
    const expected = join(targetRepo, ".claude", "worktrees", branch);
    mkdirSync(join(targetRepo, ".claude", "worktrees"), { recursive: true });
    git(otherRepo, "worktree", "add", expected, "-b", branch);

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--target",
          "target",
          targetRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("existing worktree does not match");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects an expected path nested below a matching worktree root", () => {
    const root = mkdtempSync(join(tmpdir(), "team-worktree-nested-root-"));
    const homeRepo = join(root, "home");
    const targetRepo = join(root, "target");
    const branch = "feature-work";
    initRepo(homeRepo);
    initRepo(targetRepo);
    const parentWorktree = join(targetRepo, ".claude", "worktrees");
    mkdirSync(join(targetRepo, ".claude"));
    git(targetRepo, "worktree", "add", parentWorktree, "-b", branch);
    mkdirSync(join(parentWorktree, branch));

    try {
      const result = spawnSync(
        "node",
        [
          SCRIPT,
          "--branch",
          branch,
          "--home",
          homeRepo,
          "--target",
          "target",
          targetRepo,
        ],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("existing worktree must be a repository root");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
