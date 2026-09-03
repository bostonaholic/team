import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";
import { compareChecks } from "../skills/pr-rebase/scripts/compare-checks.mjs";
import {
  parseRemoteRepository,
  parseTarget,
  verifyContext,
  verifyLocalContext,
} from "../skills/pr-rebase/scripts/context.mjs";

const SHA_A = "a".repeat(40);

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-rebase", "SKILL.md");
const CONFLICTS = join(ROOT, "skills", "pr-rebase", "references", "conflicts.md");
const PUBLISHERS = join(ROOT, "skills", "pr-rebase", "references", "publishers.md");
const CONTEXT = join(ROOT, "skills", "pr-rebase", "scripts", "context.mjs");
const body = () => (existsSync(PATH) ? read(PATH) : "");

describe("pr-rebase public contract", () => {
  test("is user-invoked with the preserved trigger and argument surface", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-rebase$/m);
    expect(fm).toMatch(/^effort:\s*high$/m);
    expect(fm).toMatch(/^argument-hint:.*pr-number-or-url/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    expect(fm).toContain("/pr-rebase");
    expect(fm.replace(/\s+/g, " ")).toMatch(/Invoke ONLY on explicit rebase intent/i);
  });

  test("uses an explicit-PR-or-fallback base chain", () => {
    const text = body();
    const explicit = text.indexOf('gh pr view "$TARGET"');
    const current = text.indexOf('elif PR_JSON="$(gh pr view');
    const origin = text.indexOf("git symbolic-ref refs/remotes/origin/HEAD");
    const main = text.indexOf("BASE=main");
    expect([explicit, current, origin, main].every((index) => index >= 0)).toBe(true);
    expect(explicit).toBeLessThan(current);
    expect(current).toBeLessThan(origin);
    expect(origin).toBeLessThan(main);
    expect(text).toMatch(/explicit PR fails.*stop/s);
    expect(text).toMatch(/With no PR.*bind-local.*provable GitHub.*permits.*publish/s);
    expect(text).toMatch(/No provable identity permits a local rebase only/s);
  });

  test("rejects unsafe state and treats prose as data", () => {
    const text = body();
    for (const token of ["LC_ALL=C", "git check-ref-format --branch", "git status --porcelain", "git rebase --show-current-patch", "MERGE_HEAD", "CHERRY_PICK_HEAD", "release/*"]) {
      expect(text).toContain(token);
    }
    expect(text).toContain("## Untrusted input");
    expect(text).toMatch(/titles, bodies, comments.*never\s+authorize/is);
  });

  test("resolves base and push remotes separately and detects publisher", () => {
    const text = body();
    expect(text).toContain("BASE_REMOTE=");
    expect(text).toContain("configured push URL");
    expect(text).toContain("headRepository");
    expect(text).toContain("validated push URL");
    expect(text).toContain("PUBLISHER=git");
    for (const marker of [".graphite_repo_config", ".arcconfig", "command -v sl"]) {
      expect(text).toContain(marker);
    }
    expect(existsSync(PUBLISHERS)).toBe(true);
  });

  test("parses stdin targets and rejects unsafe PR numbers", () => {
    expect(parseTarget("")).toEqual({ target: null, number: null, repository: null });
    expect(parseTarget("31")).toMatchObject({ target: "31", number: 31 });
    expect(parseTarget("https://github.com/acme/widgets/pull/31")).toMatchObject({
      number: 31,
      repository: "acme/widgets",
    });
    for (const target of ["0", "9007199254740992", "31 --repo other/repo", " 31"]) {
      expect(() => parseTarget(target)).toThrow();
    }

    const directory = mkdtempSync(join(tmpdir(), "team-rebase-target-"));
    const marker = join(directory, "injected");
    try {
      const result = spawnSync(process.execPath, [CONTEXT, "target"], {
        input: `31; touch ${marker}`,
        encoding: "utf8",
      });
      expect(result.status).toBe(2);
      expect(existsSync(marker)).toBe(false);
      expect(body()).not.toContain('target "$ARGUMENTS"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds current branch and exact fork/base repositories before mutation", () => {
    expect(parseRemoteRepository("git@github.com:forker/widgets.git")).toBe("forker/widgets");
    const metadata = {
      url: "https://github.com/upstream/widgets/pull/31",
      number: 31,
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feature",
      headRefOid: SHA_A,
      headRepository: { name: "widgets", nameWithOwner: "forker/widgets" },
      headRepositoryOwner: { login: "forker" },
      isDraft: false,
    };
    const context = {
      currentBranch: "feature",
      pushRemote: "fork",
      pushRemoteUrls: ["git@github.com:forker/widgets.git"],
      remotes: [
        { name: "fork", urls: ["git@github.com:forker/widgets.git"] },
        { name: "upstream", urls: ["https://github.com/upstream/widgets.git"] },
      ],
    };
    expect(verifyContext(metadata, context)).toMatchObject({
      canonicalUrl: metadata.url,
      branch: "feature",
      headOid: SHA_A,
      pushRemote: "fork",
      pushUrl: "git@github.com:forker/widgets.git",
      baseRemote: "upstream",
    });
    expect(() => verifyContext(metadata, { ...context, currentBranch: "other" })).toThrow(/current branch/);
    expect(() => verifyContext(metadata, {
      ...context,
      pushRemoteUrls: ["git@github.com:upstream/widgets.git"],
    })).toThrow(/push remote/);
    expect(() => verifyContext(metadata, {
      ...context,
      pushRemoteUrls: [
        "git@github.com:forker/widgets.git",
        "git@github.com:other/widgets.git",
      ],
    })).toThrow(/multiple repository identities/);
    expect(() => verifyContext(metadata, {
      ...context,
      remotes: [{ name: "fork", urls: ["git@github.com:forker/widgets.git"] }],
    })).toThrow(/base repository/);
    expect(() => verifyContext({ ...metadata, state: "CLOSED" }, context)).toThrow(/open/);
    expect(() => verifyContext({ ...metadata, baseRefName: "" }, context)).toThrow(/base/);
    expect(() => verifyContext({ ...metadata, baseRefName: "-unsafe" }, context)).toThrow(/base/);

    const directory = mkdtempSync(join(tmpdir(), "team-rebase-bind-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "feature"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "origin", "https://github.com/upstream/widgets.git"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["config", "remote.origin.pushurl", "git@github.com:forker/widgets.git"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["config", "branch.feature.pushRemote", "origin"], { cwd: directory }).status).toBe(0);
      const result = spawnSync(process.execPath, [CONTEXT, "bind"], {
        cwd: directory,
        input: JSON.stringify(metadata),
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        pushRemote: "origin",
        pushUrl: "git@github.com:forker/widgets.git",
        baseRemote: "origin",
      });
      const fallback = spawnSync(process.execPath, [CONTEXT, "bind-local"], {
        cwd: directory,
        input: JSON.stringify({ base: "main" }),
        encoding: "utf8",
      });
      expect(fallback.status).toBe(0);
      expect(JSON.parse(fallback.stdout)).toMatchObject({
        branch: "feature",
        base: "main",
        pushRemote: "origin",
        pushUrl: "git@github.com:forker/widgets.git",
        publishable: true,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    expect(body().indexOf('scripts/context.mjs" bind')).toBeLessThan(body().indexOf("## 1. Refuse unsafe"));
  });

  test("binds the no-PR fallback deterministically and queries the validated push URL", () => {
    const context = {
      currentBranch: "feature",
      pushRemote: "origin",
      pushRemoteUrls: ["git@github.com:forker/widgets.git"],
      remotes: [{ name: "origin", urls: ["https://github.com:upstream/widgets.git"] }],
    };
    expect(verifyLocalContext({ base: "main" }, context)).toMatchObject({
      branch: "feature",
      baseRemote: "origin",
      pushRemote: "origin",
      pushUrl: "git@github.com:forker/widgets.git",
      pushRepository: "forker/widgets",
      publishable: true,
    });
    expect(verifyLocalContext({ base: "main" }, {
      ...context,
      pushRemoteUrls: ["file:///tmp/widgets.git"],
    })).toMatchObject({ publishable: false, pushUrl: null });
    expect(() => verifyLocalContext({ base: "main" }, {
      ...context,
      pushRemoteUrls: [
        "git@github.com:forker/widgets.git",
        "https://github.com/other/widgets.git",
      ],
    })).toThrow(/multiple repository identities/);
    expect(() => verifyLocalContext({ base: "main" }, {
      ...context,
      pushRemote: "fork",
    })).toThrow(/configured push remote/);

    const directory = mkdtempSync(join(tmpdir(), "team-rebase-remote-head-"));
    const bin = join(directory, "bin");
    const trace = join(directory, "trace");
    try {
      mkdirSync(bin);
      const fakeGit = join(bin, "git");
      writeFileSync(fakeGit, `#!/bin/sh
if [ "$1" = check-ref-format ]; then exit 0; fi
printf '%s\\n' "$@" > "$TEAM_REMOTE_TRACE"
printf '${SHA_A}\\trefs/heads/feature\\n'
`);
      chmodSync(fakeGit, 0o755);
      const result = spawnSync(process.execPath, [CONTEXT, "remote-head"], {
        input: JSON.stringify({
          pushUrl: "git@github.com:forker/widgets.git",
          pushRepository: "forker/widgets",
          branch: "feature",
          expectedOid: SHA_A,
        }),
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEAM_REMOTE_TRACE: trace },
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ remoteSha: SHA_A });
      expect(readFileSync(trace, "utf8")).toBe(
        "ls-remote\n--heads\n--\ngit@github.com:forker/widgets.git\nrefs/heads/feature\n",
      );
      const mismatch = spawnSync(process.execPath, [CONTEXT, "remote-head"], {
        input: JSON.stringify({
          pushUrl: "git@github.com:forker/widgets.git",
          pushRepository: "forker/widgets",
          branch: "feature",
          expectedOid: "b".repeat(40),
        }),
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEAM_REMOTE_TRACE: trace },
      });
      expect(mismatch.status).toBe(2);
      expect(mismatch.stderr).toContain("differs from expected PR head");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }

    expect(body()).toContain('scripts/context.mjs" bind-local');
    expect(body()).toContain('scripts/context.mjs" remote-head');
    expect(body()).not.toContain('git ls-remote "${PUSH_REMOTE:?}"');
  });

  test("records recovery and check baseline before fetching", () => {
    const text = body();
    const original = text.indexOf('ORIG_SHA="$(git rev-parse HEAD)"');
    const checks = text.indexOf("running-quality-checks", original);
    const fetch = text.indexOf('git fetch "${BASE_REMOTE:?}"');
    expect(original).toBeGreaterThan(-1);
    expect(checks).toBeGreaterThan(original);
    expect(fetch).toBeGreaterThan(checks);
    expect(text).toContain("REMOTE_SHA_BEFORE");
    expect(text).toContain("docs/plans/<ID>/rebase-<n>.md");
    expect(loadsSkill(text, "artifact-frontmatter")).toBe(true);
    expect(text).toContain("Recovery: git reset --hard <ORIG_SHA>");
  });

  test("conflict reference preserves both sides and forbids skipped commits", () => {
    expect(existsSync(CONFLICTS)).toBe(true);
    const text = `${body()}\n${read(CONFLICTS)}`;
    for (const token of ['git show ":1:<path>"', 'git show ":2:<path>"', 'git show ":3:<path>"', "git add --", "git diff --name-only --diff-filter=U", "GIT_EDITOR=true git rebase --continue", "AskUserQuestion", "git rebase --abort"]) {
      expect(text).toContain(token);
    }
    expect(text).toMatch(/Never use `git rebase --skip`/);
  });

  test("mechanically blocks PASS-to-FAIL and preserves unknown evidence", () => {
    const result = compareChecks(
      [{ id: "test", status: "PASS" }, { id: "lint", status: "UNKNOWN" }],
      [{ id: "test", status: "FAIL" }, { id: "lint", status: "PASS" }],
    );
    expect(result.blocksPublish).toBe(true);
    expect(result.rows.find((row) => row.id === "lint")?.outcome).toBe("unverified");
    expect(body()).toContain("scripts/compare-checks.mjs");
  });

  test("publishes only after verification with an exact pre-fetch lease", () => {
    const text = body();
    const verify = text.indexOf("## 5. Verify against baseline");
    const publish = text.indexOf("## 6. Publish");
    const push = text.indexOf("git push --force-with-lease", publish);
    expect(verify).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(verify);
    expect(push).toBeGreaterThan(publish);
    expect(text).toContain('refs/heads/${BRANCH:?}:${REMOTE_SHA_BEFORE:?}');
    expect(text).toContain("--force-if-includes");
    expect(text).toContain('git push -u "${PUSH_REMOTE:?}" "${BRANCH:?}:${BRANCH:?}"');
    expect(text).toContain('scripts/context.mjs" remote-head');
    expect(text).toMatch(/stale lease stops verbatim/i);
    expect(text).not.toMatch(/git push --force(?:\s|$)/);
  });

  test("reports publisher, draft drift, verification, and recovery", () => {
    const text = body();
    expect(text).toContain("DRAFT_BEFORE=");
    expect(text).toContain("DRAFT_AFTER=");
    expect(text).toContain('gh pr view "$PR_URL"');
    const completion = text.slice(text.indexOf("## Completion"));
    for (const token of ["publisher", "check", "rebase-log", "Recovery:"]) {
      expect(completion).toContain(token);
    }
  });
});
