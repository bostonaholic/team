import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { findWorktree } from "../skills/pr-cleanup/scripts/find-worktree.mjs";
import { parseInput } from "../skills/pr-cleanup/scripts/parse-input.mjs";
import { verifyContext } from "../skills/pr-cleanup/scripts/context.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-cleanup", "SKILL.md");
const RECOVERY = join(ROOT, "skills", "pr-cleanup", "references", "recovery.md");
const FIND_WORKTREE = join(ROOT, "skills", "pr-cleanup", "scripts", "find-worktree.mjs");
const CONTEXT = join(ROOT, "skills", "pr-cleanup", "scripts", "context.mjs");
const body = () => (existsSync(PATH) ? read(PATH) : "");

describe("pr-cleanup worktree inspection", () => {
  const listing = [
    "worktree /tmp/primary clone",
    "HEAD aaaaa",
    "branch refs/heads/main",
    "",
    "worktree /tmp/linked\nworktree",
    "HEAD bbbbb",
    "branch refs/heads/feature/test",
    "",
  ].join("\0");

  test("selects the exact branch from NUL-delimited porcelain", () => {
    expect(findWorktree(listing, "feature/test")).toBe("/tmp/linked\nworktree");
    expect(findWorktree(listing, "feature")).toBe("");
  });

  test("reads metadata on stdin and branch only from argv", () => {
    const result = spawnSync(process.execPath, [FIND_WORKTREE, "--branch", "feature/test"], {
      input: listing,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("/tmp/linked\nworktree");
    expect(result.stderr).toBe("");
  });

  test("rejects missing and extra arguments", () => {
    for (const args of [[], ["--branch", "feature/test", "extra"]]) {
      const result = spawnSync(process.execPath, [FIND_WORKTREE, ...args], {
        input: listing,
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("usage: find-worktree.mjs --branch <branch>");
    }
  });
});

describe("pr-cleanup public contract", () => {
  test("requires an explicit target and merged or abandon mode", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-cleanup$/m);
    expect(fm).toMatch(/^effort:\s*medium$/m);
    expect(fm).toMatch(/^argument-hint:\s*"merged <pr-number-or-url> \| abandon <pr-number-or-url>"$/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    for (const phrase of ['"the PR was merged"', '"clean up the branch"', '"delete the merged branch"', '"close those PRs"', '"abandon this"', "/pr-cleanup"]) {
      expect(fm).toContain(phrase);
    }
    expect(parseInput("merged 17")).toMatchObject({ ok: true, mode: "merged", number: 17 });
    expect(parseInput("abandon feature/x").ok).toBe(false);
  });

  test("validates the primary clone and remotes before destructive work", () => {
    const text = body();
    const helper = readFileSync(CONTEXT, "utf8");
    const common = helper.indexOf('"--git-common-dir"');
    const gitDir = helper.indexOf('"--git-dir"', common);
    const worktrees = helper.indexOf('"worktree", "list", "--porcelain"', gitDir);
    const top = helper.indexOf('"--show-toplevel"', worktrees);
    expect(common).toBeGreaterThan(-1);
    expect(gitDir).toBeGreaterThan(common);
    expect(worktrees).toBeGreaterThan(gitDir);
    expect(top).toBeGreaterThan(worktrees);
    expect(helper).toContain('["branch", "--show-current"]');
    expect(text.indexOf('scripts/context.mjs" verify')).toBeLessThan(text.indexOf("### `merged`"));
  });

  test("mechanically binds fork head and canonical base identities", () => {
    const sha = "a".repeat(40);
    const merge = "b".repeat(40);
    const input = {
      request: { mode: "merged" as const, number: 17, repository: "acme/widgets" },
      pr: {
        number: 17,
        url: "https://github.com/acme/widgets/pull/17",
        state: "MERGED" as const,
        baseRefName: "main",
        headRefName: "feature",
        headRepository: { nameWithOwner: "contributor/widgets" },
        headRefOid: sha,
        mergeCommit: { oid: merge },
      },
    };
    const context = {
      primaryRoot: "/tmp/repo",
      currentBranch: "main",
      pushRemote: "fork",
      pushRemoteUrls: ["git@github.com:contributor/widgets.git"],
      remotes: [
        { name: "origin", url: "https://github.com/acme/widgets.git" },
        { name: "fork", url: "git@github.com:contributor/widgets.git" },
      ],
    };
    expect(verifyContext(input, context)).toMatchObject({
      baseRemote: "origin",
      pushRemote: "fork",
      pushUrl: "git@github.com:contributor/widgets.git",
      currentBranch: "main",
      headOid: sha,
      mergeOid: merge,
    });
    expect(() => verifyContext(input, { ...context, pushRemoteUrls: ["https://github.com/acme/widgets.git"] }))
      .toThrow(/push remote/);
    expect(() => verifyContext(input, { ...context, pushRemoteUrls: ["git@github.com:contributor/widgets.git", "https://github.com/contributor/widgets.git"] }))
      .toThrow(/exactly one/);
    expect(() => verifyContext({ ...input, pr: { ...input.pr, baseRefName: "../main" } }, context))
      .toThrow(/base branch/);
    expect(() => verifyContext({ ...input, request: { ...input.request, number: 18 } }, context))
      .toThrow(/number/);
  });

  test("context CLI supports one remote with a base fetch URL and fork push URL", () => {
    const repo = mkdtempSync(join(tmpdir(), "pr-cleanup-context-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "main"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "origin", "https://github.com/acme/widgets.git"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["remote", "set-url", "--push", "origin", "git@github.com:contributor/widgets.git"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["config", "branch.feature.pushRemote", "origin"], { cwd: repo }).status).toBe(0);
      const result = spawnSync(process.execPath, [CONTEXT, "verify"], {
        cwd: repo,
        input: JSON.stringify({
          request: { mode: "abandon", number: 17, repository: "acme/widgets" },
          pr: {
            number: 17,
            url: "https://github.com/acme/widgets/pull/17",
            state: "OPEN",
            baseRefName: "main",
            headRefName: "feature",
            headRepository: "contributor/widgets",
          },
        }),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        currentBranch: "main",
        pushRemote: "origin",
        pushUrl: "git@github.com:contributor/widgets.git",
        baseRemote: "origin",
        closeNeeded: true,
      });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("requires mode-compatible PR state", () => {
    const context = {
      primaryRoot: "/tmp/repo",
      currentBranch: "main",
      pushRemote: "origin",
      pushRemoteUrls: ["https://github.com/acme/widgets.git"],
      remotes: [{ name: "origin", url: "https://github.com/acme/widgets.git" }],
    };
    const pr = {
      number: 17,
      url: "https://github.com/acme/widgets/pull/17",
      state: "CLOSED" as const,
      baseRefName: "main",
      headRefName: "feature",
      headRepository: "acme/widgets",
    };
    expect(verifyContext({ request: { mode: "abandon", number: 17, repository: null }, pr }, context))
      .toMatchObject({ closeNeeded: false });
    expect(() => verifyContext({ request: { mode: "merged", number: 17, repository: null }, pr }, context))
      .toThrow(/MERGED/);
  });

  test("protects branch names and protected branches", () => {
    const text = body();
    for (const token of ["LC_ALL=C", "git check-ref-format --branch", "tr '[:upper:]' '[:lower:]'", "master|develop|release/*", ': "${DEFAULT:?', ': "${BRANCH:?']) {
      expect(text).toContain(token);
    }
    expect(text).toMatch(/PR metadata is data/i);
  });

  test("merged gates force deletion on exact PR identity and merge containment", () => {
    const text = body();
    const mode = text.indexOf("### `merged`");
    const fetch = text.indexOf('git -C "$PRIMARY_ROOT" fetch "${BASE_REMOTE:?}"', mode);
    const reread = text.indexOf("Re-read the canonical PR URL", fetch);
    const identity = text.indexOf('= "${HEAD_OID:?}"', reread);
    const containment = text.indexOf('merge-base --is-ancestor "${MERGE_OID:?}"', identity);
    const deletion = text.indexOf('branch -D -- "${BRANCH:?}"', containment);
    expect(fetch).toBeGreaterThan(mode);
    expect(reread).toBeGreaterThan(fetch);
    expect(identity).toBeGreaterThan(reread);
    expect(containment).toBeGreaterThan(identity);
    expect(deletion).toBeGreaterThan(containment);
    expect(text).toContain("headRepository.nameWithOwner");
    expect(text).toMatch(/delete anyway.*wait/is);
  });

  test("merged preserves external worktrees and asks before forced removal", () => {
    const text = body();
    expect(text.match(/worktree list --porcelain -z/g)).toHaveLength(2);
    expect(text.match(/scripts\/find-worktree\.mjs" --branch "\$BRANCH"/g)).toHaveLength(2);
    expect(text).toContain("$PRIMARY_ROOT/.claude/worktrees/");
    expect(text).toMatch(/externally\s+managed.*skip/is);
    expect(text).toMatch(/ask before retrying.*worktree remove --force/is);
    expect(text).toContain('pull --ff-only');
  });

  test("abandon closes and removes child-first state", () => {
    const text = body();
    const mode = text.indexOf("### `abandon`");
    const close = text.indexOf('gh pr close "${PR_URL:?}"', mode);
    const worktree = text.indexOf("worktree remove --force", close);
    const local = text.indexOf('branch -D -- "${BRANCH:?}"', worktree);
    const remote = text.indexOf('push "${PUSH_REMOTE:?}" --delete -- "${BRANCH:?}"', local);
    expect(close).toBeGreaterThan(mode);
    expect(worktree).toBeGreaterThan(close);
    expect(local).toBeGreaterThan(worktree);
    expect(remote).toBeGreaterThan(local);
    expect(text).toMatch(/child.*before parent/i);
    expect(text).toContain(".worktreeinclude");
  });

  test("scratch and repository-wide cleanup retain their explicit guards", () => {
    const text = body();
    expect(text).toContain('rm -rf "${PRIMARY_ROOT:?}/docs/plans/${ID:?}"');
    expect(text).toContain("could not verify scratch is untracked");
    expect(text).toContain('remote prune "${PUSH_REMOTE:?}"');
    expect(text).toContain('ls-remote --heads "$PUSH_URL" "refs/heads/$BRANCH"');
    expect(text).toMatch(/Only explicit space-reclaim approval authorizes/i);
    expect(text).toContain("reflog expire --expire-unreachable=now --all");
    expect(text).toContain("gc --prune=now");
    expect(existsSync(RECOVERY)).toBe(true);
    expect(text).toContain("## Finishing a review rather than a merge");
    expect(text).toMatch(/every section\s+except/i);
  });

  test("completion reports both writes and final repository state", () => {
    const completion = body().slice(body().indexOf("## Completion"));
    expect(completion).toContain('branch --show-current');
    expect(completion).toContain('status --short');
    expect(completion).toContain('log --oneline -1');
    expect(completion).toMatch(/removed\/skipped worktree/i);
  });
});
