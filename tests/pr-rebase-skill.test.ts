import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import { loadsSkill } from "./helpers/skill-refs";
import { compareChecks } from "../skills/pr-rebase/scripts/compare-checks.mjs";
import { parseTarget, verifyContext } from "../skills/pr-rebase/scripts/context.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-rebase", "SKILL.md");
const CONFLICTS = join(ROOT, "skills", "pr-rebase", "references", "conflicts.md");
const PUBLISHERS = join(ROOT, "skills", "pr-rebase", "references", "publishers.md");
const body = () => (existsSync(PATH) ? read(PATH) : "");

describe("pr-rebase public contract", () => {
  test("is user-invoked with the preserved trigger and argument surface", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-rebase$/m);
    expect(fm).toMatch(/^effort:\s*high$/m);
    expect(fm).toMatch(/^argument-hint:\s*"<pr-number-or-url>"$/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
    expect(fm).toContain("/pr-rebase");
    expect(fm.replace(/\s+/g, " ")).toMatch(/Invoke ONLY on explicit rebase intent/i);
  });

  test("requires the explicit PR and has no target fallback", () => {
    const text = body();
    const explicit = text.indexOf('gh pr view "$TARGET"');
    expect(explicit).toBeGreaterThan(-1);
    expect(text).not.toContain("gh pr view --json baseRefName");
    expect(text).not.toContain("git symbolic-ref refs/remotes/origin/HEAD");
    expect(text).not.toContain("BASE=main");
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
    expect(text).toContain("configured push URLs");
    expect(text).toContain("baseRemote");
    expect(text).toContain("headRepository");
    expect(text).toContain('git ls-remote --heads "${PUSH_URL:?}"');
    expect(text).toContain("PUBLISHER=git");
    for (const marker of [".graphite_repo_config", ".arcconfig", "command -v sl"]) {
      expect(text).toContain(marker);
    }
    expect(existsSync(PUBLISHERS)).toBe(true);
  });

  test("parses stdin targets and verifies exact fork/base repository identity", () => {
    expect(parseTarget("31\n")).toMatchObject({ number: 31 });
    const verified = verifyContext({
      url: "https://github.com/acme/widgets/pull/31",
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feature",
      headRepository: "contributor/widgets",
      currentBranch: "feature",
      pushRemote: "origin",
      remotes: [
        { name: "origin", url: "git@github.com:contributor/widgets.git" },
        { name: "upstream", url: "https://github.com/acme/widgets.git" },
      ],
    });
    expect(verified).toMatchObject({
      pushRemote: "origin",
      pushUrl: "git@github.com:contributor/widgets.git",
      baseRemote: "upstream",
    });
    expect(() => verifyContext({ ...verified, state: "OPEN", url: verified.url, baseRefName: "main", headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", remotes: [{ name: "origin", url: "https://github.com/not-acme/widgets.git" }] })).toThrow();
    expect(() => verifyContext({ ...verified, state: "CLOSED", url: verified.url, baseRefName: "main", headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", remotes: [{ name: "origin", url: "git@github.com:contributor/widgets.git" }, { name: "upstream", url: "https://github.com/acme/widgets.git" }] })).toThrow(/OPEN/);
    expect(() => verifyContext({ ...verified, state: "OPEN", url: verified.url, baseRefName: "main x", headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", remotes: [{ name: "origin", url: "git@github.com:contributor/widgets.git" }, { name: "upstream", url: "https://github.com/acme/widgets.git" }] })).toThrow(/base branch/);
    expect(() => verifyContext({ ...verified, state: "OPEN", url: verified.url, baseRefName: "main", headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", pushRemoteUrls: ["git@github.com:contributor/widgets.git", "https://github.com/contributor/widgets.git"], remotes: [{ name: "origin", url: "git@github.com:contributor/widgets.git" }, { name: "upstream", url: "https://github.com/acme/widgets.git" }] })).toThrow(/exactly one/);
    expect(body().indexOf("scripts/context.mjs\" verify")).toBeLessThan(body().indexOf("## 2. Capture baseline"));
  });

  test("records recovery and check baseline before fetching", () => {
    const text = body();
    const original = text.indexOf('ORIG_SHA="$(git rev-parse HEAD)"');
    const checks = text.indexOf("running-quality-checks", original);
    const fetch = text.indexOf('git fetch "${BASE_REMOTE:?}"');
    expect(original).toBeGreaterThan(-1);
    expect(checks).toBeGreaterThan(original);
    expect(fetch).toBeGreaterThan(checks);
    expect(text).toContain("REMOTE_SHA_BEFORE=");
    expect(text).not.toContain('git rev-parse "${PUSH_REMOTE:?}/$BRANCH"');
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
    expect(text).toContain('${BRANCH:?}:${REMOTE_SHA_BEFORE:?}');
    expect(text).toContain("--force-if-includes");
    expect(text).toContain('git push -u "${PUSH_REMOTE:?}" "${BRANCH:?}"');
    expect(text).toContain('git ls-remote "${PUSH_URL:?}"');
    expect(text).toMatch(/stale lease stops verbatim/i);
    expect(text).not.toMatch(/git push --force(?:\s|$)/);
  });

  test("reports publisher, draft drift, verification, and recovery", () => {
    const text = body();
    expect(text).toContain("DRAFT_BEFORE=");
    expect(text).toContain("DRAFT_AFTER=");
    const completion = text.slice(text.indexOf("## Completion"));
    for (const token of ["publisher", "check", "rebase-log", "Recovery:"]) {
      expect(completion).toContain(token);
    }
  });
});
