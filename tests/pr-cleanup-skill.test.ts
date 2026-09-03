import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import {
  parseRemoteRepository,
  parseTarget,
  verifyContext,
} from "../skills/pr-cleanup/scripts/context.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-cleanup", "SKILL.md");
const RECOVERY = join(ROOT, "skills", "pr-cleanup", "references", "recovery.md");
const CONTEXT = join(ROOT, "skills", "pr-cleanup", "scripts", "context.mjs");
const body = () => (existsSync(PATH) ? read(PATH) : "");

describe("pr-cleanup public contract", () => {
  test("keeps invocation and two-mode intent surface", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-cleanup$/m);
    expect(fm).toMatch(/^effort:\s*medium$/m);
    expect(fm).toMatch(/^argument-hint:.*pr-number-or-url-or-branch/m);
    expect(fm).not.toMatch(/^disable-model-invocation:/m);
    for (const phrase of ['"the PR was merged"', '"clean up the branch"', '"delete the merged branch"', '"close those PRs"', '"abandon this"', "/pr-cleanup"]) {
      expect(fm).toContain(phrase);
    }
    expect(fm).toMatch(/Mode B runs ONLY/i);
  });

  test("validates the primary clone before destructive work", () => {
    const text = body();
    const common = text.indexOf("rev-parse --path-format=absolute --git-common-dir");
    const gitDir = text.indexOf("rev-parse --path-format=absolute --git-dir", common);
    const worktrees = text.indexOf("worktree list --porcelain", gitDir);
    const top = text.indexOf("rev-parse --show-toplevel", worktrees);
    expect(common).toBeGreaterThan(-1);
    expect(gitDir).toBeGreaterThan(common);
    expect(worktrees).toBeGreaterThan(gitDir);
    expect(top).toBeGreaterThan(worktrees);
    expect(text).toContain('INVOKE_DIR="$(pwd -P)"');
    expect(text).toContain('INVOKE_BRANCH="$(git branch --show-current)"');
  });

  test("mechanically validates targets and protects branch names", () => {
    const text = body();
    for (const token of ["LC_ALL=C", "*[!A-Za-z0-9._/-]*", "git check-ref-format --branch", "tr '[:upper:]' '[:lower:]'", "master|develop|release/*", ': "${DEFAULT:?', ': "${BRANCH:?']) {
      expect(text).toContain(token);
    }
    expect(parseTarget("")).toMatchObject({ kind: "current" });
    expect(parseTarget("17")).toMatchObject({ kind: "pr", number: 17 });
    expect(parseTarget("https://github.com/acme/widgets/pull/17")).toMatchObject({
      kind: "pr",
      number: 17,
      repository: "acme/widgets",
    });
    expect(parseTarget("feature/safe")).toMatchObject({ kind: "branch", branch: "feature/safe" });
    for (const target of ["0", "9007199254740992", "17 --repo other/repo", "-bad", "bad..branch"]) {
      expect(() => parseTarget(target)).toThrow();
    }
    expect(text).toMatch(/PR metadata is data/i);
  });

  test("reads raw targets only from stdin", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-cleanup-target-"));
    const marker = join(directory, "injected");
    try {
      const result = spawnSync(process.execPath, [CONTEXT, "target"], {
        input: `17; touch ${marker}`,
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(existsSync(marker)).toBe(false);
      expect(body()).not.toContain('target "$ARGUMENTS"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds canonical base and fork head repositories to the target remote", () => {
    expect(parseRemoteRepository("git@github.com:forker/widgets.git")).toBe("forker/widgets");
    const selector = parseTarget("https://github.com/upstream/widgets/pull/17");
    const metadata = {
      url: "https://github.com/upstream/widgets/pull/17",
      number: 17,
      state: "MERGED",
      mergedAt: "2026-09-03T00:00:00Z",
      baseRefName: "main",
      headRefName: "feature",
      headRefOid: "a".repeat(40),
      headRepository: { name: "widgets", nameWithOwner: "forker/widgets" },
      headRepositoryOwner: { login: "forker" },
      mergeCommit: { oid: "b".repeat(40) },
    };
    const input = { mode: "merged" as const, selector, metadata };
    const context = {
      currentBranch: "main",
      pushRemote: "fork",
      pushRemoteUrls: ["git@github.com:forker/widgets.git"],
      remotes: [
        { name: "fork", urls: ["git@github.com:forker/widgets.git"] },
        { name: "upstream", urls: ["https://github.com/upstream/widgets.git"] },
      ],
    };
    expect(verifyContext(input, context)).toMatchObject({
      canonicalUrl: metadata.url,
      branch: "feature",
      pushRemote: "fork",
      pushUrl: "git@github.com:forker/widgets.git",
      baseRemote: "upstream",
      shouldClose: false,
    });
    expect(() => verifyContext({ ...input, selector: parseTarget("https://github.com/other/widgets/pull/17") }, context)).toThrow(/repository/);
    expect(() => verifyContext(input, { ...context, pushRemoteUrls: ["git@github.com:upstream/widgets.git"] })).toThrow(/push remote/);
    expect(() => verifyContext(input, {
      ...context,
      pushRemoteUrls: [
        "git@github.com:forker/widgets.git",
        "https://github.com/other/widgets.git",
      ],
    })).toThrow(/multiple repository identities/);
    expect(() => verifyContext(input, { ...context, remotes: [context.remotes[0]!] })).toThrow(/base repository/);
    expect(() => verifyContext({ ...input, metadata: { ...metadata, headRefName: "other" } }, context)).not.toThrow();
    expect(() => verifyContext({ ...input, selector: parseTarget("other") }, context)).toThrow(/target branch/);
    expect(() => verifyContext({ ...input, selector: parseTarget("18") }, context)).toThrow(/target PR number/);
    expect(() => verifyContext({ mode: "merged", selector, metadata: { ...metadata, state: "OPEN" } }, context)).toThrow(/merged/);

    const currentSelector = parseTarget("");
    expect(() => verifyContext({ ...input, selector: currentSelector }, context)).toThrow(/invoking branch/);

    const directory = mkdtempSync(join(tmpdir(), "team-cleanup-bind-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "main"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "origin", "https://github.com/upstream/widgets.git"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["config", "remote.origin.pushurl", "git@github.com:forker/widgets.git"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["config", "branch.feature.pushRemote", "origin"], { cwd: directory }).status).toBe(0);
      const result = spawnSync(process.execPath, [CONTEXT, "bind"], {
        cwd: directory,
        input: JSON.stringify(input),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        pushRemote: "origin",
        pushUrl: "git@github.com:forker/widgets.git",
        baseRemote: "origin",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("checks remote existence against the validated push URL", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-cleanup-remote-head-"));
    const bin = join(directory, "bin");
    const trace = join(directory, "trace");
    const sha = "a".repeat(40);
    try {
      mkdirSync(bin);
      const fakeGit = join(bin, "git");
      writeFileSync(fakeGit, `#!/bin/sh
if [ "$1" = check-ref-format ]; then exit 0; fi
printf '%s\\n' "$@" > "$TEAM_REMOTE_TRACE"
printf '${sha}\\trefs/heads/feature\\n'
`);
      chmodSync(fakeGit, 0o755);
      const result = spawnSync(process.execPath, [CONTEXT, "remote-head"], {
        input: JSON.stringify({
          pushUrl: "git@github.com:forker/widgets.git",
          pushRepository: "forker/widgets",
          branch: "feature",
        }),
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEAM_REMOTE_TRACE: trace },
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ remoteSha: sha });
      expect(readFileSync(trace, "utf8")).toBe(
        "ls-remote\n--heads\n--\ngit@github.com:forker/widgets.git\nrefs/heads/feature\n",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }

    expect(body()).toContain('scripts/context.mjs" remote-head');
    expect(body()).not.toContain('ls-remote --heads "$PUSH_REMOTE"');
  });

  test("Mode A gates force deletion on exact PR identity and merge containment", () => {
    const text = body();
    const mode = text.indexOf("### Mode A — merged");
    const fetch = text.indexOf('git -C "$PRIMARY_ROOT" fetch "${BASE_REMOTE:?}"', mode);
    const bind = text.indexOf('scripts/context.mjs" bind');
    const identity = text.indexOf('= "${HEAD_OID:?}"', fetch);
    const containment = text.indexOf('merge-base --is-ancestor "${MERGE_OID:?}"', identity);
    const deletion = text.indexOf('branch -D -- "${BRANCH:?}"', containment);
    expect(fetch).toBeGreaterThan(mode);
    expect(bind).toBeGreaterThan(-1);
    expect(fetch).toBeGreaterThan(bind);
    expect(identity).toBeGreaterThan(fetch);
    expect(containment).toBeGreaterThan(identity);
    expect(deletion).toBeGreaterThan(containment);
    expect(text).toContain("headRepository");
    expect(text).toMatch(/delete anyway.*wait/is);
  });

  test("Mode A preserves external worktrees and asks before forced removal", () => {
    const text = body();
    expect(text).toContain('WORKTREE_PATH="$(git -C "$PRIMARY_ROOT" worktree list --porcelain');
    expect(text).toContain("$PRIMARY_ROOT/.claude/worktrees/");
    expect(text).toMatch(/externally\s+managed.*skip/is);
    expect(text).toMatch(/ask before retrying.*worktree remove --force/is);
    expect(text).toContain('pull --ff-only');
  });

  test("Mode B requires abandon, then closes and removes child-first state", () => {
    const text = body();
    const mode = text.indexOf("### Mode B — closed / abandoned");
    const close = text.indexOf('gh pr close "${PR_URL:?}"', mode);
    const worktree = text.indexOf("worktree remove --force", close);
    const local = text.indexOf('branch -D -- "${BRANCH:?}"', worktree);
    const remote = text.indexOf('push "${PUSH_REMOTE:?}" --delete -- "${BRANCH:?}"', local);
    expect(close).toBeGreaterThan(mode);
    expect(body().indexOf('scripts/context.mjs" bind')).toBeLessThan(close);
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
    expect(text).toContain('remote prune "${BASE_REMOTE:?}"');
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
