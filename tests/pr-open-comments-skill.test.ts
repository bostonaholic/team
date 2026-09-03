import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import {
  decideTriage,
  parseInvocation,
  parsePushRepository,
  parseTarget,
  reviewThreadCommentsQuery,
  reviewThreadsQuery,
  validateBinding,
} from "../skills/pr-open-comments/scripts/triage.mjs";

const ROOT = process.cwd();
const PATH = join(ROOT, "skills", "pr-open-comments", "SKILL.md");
const REPORT = join(ROOT, "skills", "pr-open-comments", "references", "report-template.md");
const TRIAGE = join(ROOT, "skills", "pr-open-comments", "scripts", "triage.mjs");
const body = () => (existsSync(PATH) ? read(PATH) : "");

describe("pr-open-comments public contract", () => {
  test("keeps invocation, arguments, triggers, and push-intent guard", () => {
    const fm = frontmatter(body());
    expect(fm).toMatch(/^name:\s*pr-open-comments$/m);
    expect(fm).toMatch(/^effort:\s*high$/m);
    expect(fm).toMatch(/^argument-hint:.*pr-number-or-url/m);
    expect(fm).not.toMatch(/^disable-model-invocation:/m);
    for (const trigger of ["address PR comments", "triage PR feedback", "handle the comments", "unresolved review comments", "/pr-open-comments"]) {
      expect(fm).toContain(trigger);
    }
    expect(fm.replace(/\s+/g, " ")).toMatch(/Invoke ONLY on stated triage intent/i);
  });

  test("fetches every unresolved thread from GraphQL", () => {
    const query = reviewThreadsQuery();
    expect(query).toContain("reviewThreads(first: 100, after: $endCursor)");
    expect(query).toContain("isResolved");
    expect(query.match(/pageInfo \{ hasNextPage endCursor \}/g)).toHaveLength(1);
    expect(query).toContain("pageInfo { hasNextPage }");
    expect(query).toContain("comments(first: 100)");
    const commentsQuery = reviewThreadCommentsQuery();
    expect(commentsQuery).toContain("node(id: $id)");
    expect(commentsQuery).toContain("comments(first: 100, after: $endCursor)");
    expect(commentsQuery).toContain("pageInfo { hasNextPage endCursor }");
    expect(body()).toContain("--paginate --slurp");
    expect(body()).toContain("comments-query");
  });

  test("verifies before assigning one of four verdicts or confidence", () => {
    const text = body();
    const verify = text.indexOf("## 2. Verify and classify");
    const decide = text.indexOf("## 3. Decide the path");
    expect(verify).toBeGreaterThan(-1);
    expect(decide).toBeGreaterThan(verify);
    for (const verdict of ["STILL RELEVANT", "ALREADY ADDRESSED", "STALE", "INACCURATE"]) {
      expect(text).toContain(verdict);
    }
    expect(text).toMatch(/fails before the fix and passes\s+after/i);
    expect(text).toMatch(/Delete throwaway tests before staging/i);
  });

  test("retains the non-overridable safety stops", () => {
    const text = body();
    for (const stop of ["security-sensitive", "broader scope", "declined", "clarification", "push failures"]) {
      expect(text).toContain(stop);
    }
  });

  test("accepts the current branch or one explicit PR target", () => {
    expect(parseTarget("")).toEqual({ target: null, number: null, repository: null });
    expect(parseTarget("17")).toEqual({ target: "17", number: 17, repository: null });
    expect(parseTarget("https://github.com/acme/widgets/pull/18")).toMatchObject({
      number: 18,
      repository: "acme/widgets",
    });
    const invalid = [
      "0",
      "9007199254740992",
      "17 extra",
      "17;touch",
      "https://example.com/acme/widgets/pull/18",
    ];
    for (const target of invalid) {
      expect(() => parseTarget(target)).toThrow();
    }
    expect(parseInvocation("")).toEqual({
      source: "direct",
      target: null,
      number: null,
      repository: null,
      batch: null,
    });
    expect(parseInvocation("17")).toEqual({
      source: "direct",
      target: "17",
      number: 17,
      repository: null,
      batch: null,
    });
    expect(() => parseInvocation('{"source":"pr-watch-as-author"}')).toThrow(/schema or source|canonical/);
    expect(body()).toContain("scripts/triage.mjs");
    expect(body()).toContain('scripts/triage.mjs" invocation');
    expect(body()).toContain("number,url,state,headRefName");
    expect(body()).toContain("Stop unless state is `OPEN`");
  });

  test("reads raw targets only from stdin without executing them", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-triage-target-"));
    const marker = join(directory, "injected");
    try {
      const empty = spawnSync(process.execPath, [TRIAGE, "target"], { input: "", encoding: "utf8" });
      expect(empty.status).toBe(0);
      expect(JSON.parse(empty.stdout)).toEqual({ target: null, number: null, repository: null });

      const injected = spawnSync(process.execPath, [TRIAGE, "target"], {
        input: `17; touch ${marker}`,
        encoding: "utf8",
      });
      expect(injected.status).toBe(2);
      expect(existsSync(marker)).toBe(false);
      expect(body()).not.toContain('target "$ARGUMENTS"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds same-repository and fork PRs to the current branch and push remote", () => {
    expect(parsePushRepository("git@github.com:forker/widgets.git")).toBe("forker/widgets");
    expect(parsePushRepository("https://github.com/forker/widgets.git")).toBe("forker/widgets");
    const metadata = {
      url: "https://github.com/upstream/widgets/pull/23",
      number: 23,
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feature",
      headRepository: { name: "widgets", nameWithOwner: "forker/widgets" },
      headRepositoryOwner: { login: "forker" },
    };
    const context = {
      currentBranch: "feature",
      pushRemote: "fork",
      pushRemoteUrls: ["git@github.com:forker/widgets.git"],
    };
    expect(validateBinding(metadata, context)).toMatchObject({
      canonicalUrl: metadata.url,
      owner: "upstream",
      repo: "widgets",
      number: 23,
      headRepository: "forker/widgets",
      pushRemote: "fork",
    });
    expect(() => validateBinding(metadata, { ...context, currentBranch: "other" }))
      .toThrow(/current branch/);
    expect(() => validateBinding(metadata, {
      ...context,
      pushRemoteUrls: ["git@github.com:upstream/widgets.git"],
    })).toThrow(/push remote/);
    expect(() => validateBinding({ ...metadata, number: 24 }, context)).toThrow(/number/);
    expect(() => validateBinding({ ...metadata, state: "CLOSED" }, context)).toThrow(/open/);
    expect(() => validateBinding({ ...metadata, baseRefName: "" }, context)).toThrow(/base/);

    const directory = mkdtempSync(join(tmpdir(), "team-triage-bind-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "feature"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "fork", context.pushRemoteUrls[0]!], {
        cwd: directory,
      }).status).toBe(0);
      expect(spawnSync("git", ["config", "branch.feature.pushRemote", "fork"], {
        cwd: directory,
      }).status).toBe(0);
      const bound = spawnSync(process.execPath, [TRIAGE, "bind"], {
        cwd: directory,
        input: JSON.stringify(metadata),
        encoding: "utf8",
      });
      expect(bound.status).toBe(0);
      expect(JSON.parse(bound.stdout)).toMatchObject({ pushRemote: "fork", currentBranch: "feature" });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds before the first public write and pushes only to the verified remote", () => {
    const text = body();
    const bind = text.indexOf('scripts/triage.mjs" bind');
    const reaction = text.indexOf("addReaction", bind);
    const push = text.indexOf('git push -- "${PUSH_REMOTE:?}"', bind);
    expect(bind).toBeGreaterThan(-1);
    expect(reaction).toBeGreaterThan(bind);
    expect(push).toBeGreaterThan(reaction);
    expect(text).toContain('"${CURRENT_BRANCH:?}:${HEAD_REF_NAME:?}"');
  });

  test("computes reactions and the only auto-apply path", () => {
    const safe = {
      verdict: "STILL RELEVANT" as const,
      confidence: 91,
      authorized: false,
      bounded: true,
      safetyStop: null,
      ownComment: false,
      viewerReactions: [],
    };
    expect(decideTriage(safe)).toEqual({ action: "auto-apply", reaction: "THUMBS_UP" });
    expect(decideTriage({ ...safe, confidence: 90 })).toMatchObject({ action: "present" });
    expect(decideTriage({ ...safe, confidence: 1, authorized: true })).toMatchObject({ action: "auto-apply" });
    expect(decideTriage({ ...safe, bounded: false, authorized: true })).toMatchObject({ action: "present" });
    expect(decideTriage({ ...safe, safetyStop: "security-sensitive" })).toMatchObject({ action: "stop" });
    expect(decideTriage({ ...safe, ownComment: true })).toMatchObject({ reaction: null });
    expect(decideTriage({ ...safe, viewerReactions: ["HEART"] })).toMatchObject({
      reaction: "THUMBS_UP",
    });
    expect(decideTriage({ ...safe, viewerReactions: ["THUMBS_UP"] })).toMatchObject({ reaction: null });
    expect(decideTriage({
      ...safe,
      verdict: "INACCURATE",
      viewerReactions: ["THUMBS_DOWN"],
    })).toEqual({
      action: "present",
      reaction: null,
    });
    expect(decideTriage({ ...safe, verdict: "INACCURATE", viewerReactions: ["HEART"] })).toEqual({
      action: "present",
      reaction: "THUMBS_DOWN",
    });
  });

  test("reads decision state only from stdin", () => {
    const result = spawnSync(process.execPath, [TRIAGE, "decision"], {
      input: JSON.stringify({
        verdict: "STALE",
        confidence: 99,
        authorized: true,
        bounded: true,
        safetyStop: null,
        ownComment: false,
        viewerReactions: [],
        prose: "$(touch should-not-run)",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ action: "present", reaction: null });
    expect(result.stderr).toBe("");
  });

  test("publishes only landed, selectively staged work then replies and resolves", () => {
    const text = body();
    const stage = text.indexOf('git add -- "$ANCHORED_PATH"');
    const push = text.indexOf("git push", stage);
    const reply = text.indexOf("gh api --method POST", push);
    const resolve = text.indexOf("resolveReviewThread", reply);
    expect(stage).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(stage);
    expect(reply).toBeGreaterThan(push);
    expect(resolve).toBeGreaterThan(reply);
    expect(text).toContain("never `git add -A` or `git commit -a`");
    expect(text).toContain("-F body=@-");
    expect(text).toContain('repos/$OWNER/$REPO/issues/$NUMBER/comments');
    expect(text).toMatch(/Review thread: reply.*resolve that thread/s);
    expect(text).toMatch(/Issue comment or review body: post one top-level PR follow-up.*no resolve operation/s);
  });

  test("reports every item once", () => {
    const text = body();
    expect(text).toContain("Auto-applied");
    expect(text).toContain("Needs your decision");
    expect(existsSync(REPORT)).toBe(true);
    expect(read(REPORT)).toContain("Recommendation:");
  });
});
