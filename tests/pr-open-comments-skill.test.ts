import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import {
  decideTriage,
  parseInvocation,
  parseTarget,
  reviewThreadCommentsQuery,
  reviewThreadsQuery,
  verifyHead,
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
    expect(fm).toMatch(/^argument-hint:\s*"<pr-number-or-url>"$/m);
    expect(fm).toMatch(/^disable-model-invocation:\s*true$/m);
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

  test("parses only one explicit PR target", () => {
    expect(parseTarget("17")).toEqual({ target: "17", number: 17, repository: null });
    expect(parseTarget("https://github.com/acme/widgets/pull/18")).toMatchObject({
      number: 18,
      repository: "acme/widgets",
    });
    for (const target of ["", "17 extra", "17;touch", "https://example.com/acme/widgets/pull/18"]) {
      expect(() => parseTarget(target)).toThrow(/one PR number or canonical URL/);
    }
    expect(parseInvocation("17")).toEqual({
      source: "direct",
      target: "17",
      number: 17,
      repository: null,
      batch: null,
    });
    expect(() => parseInvocation('{"source":"pr-watch-as-author"}')).toThrow(/schema or source|canonical/);
    expect(body()).toContain("scripts/triage.mjs");
    expect(body()).toContain("scripts/triage.mjs\" invocation");
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
    expect(decideTriage({ ...safe, safetyStop: "security-sensitive" })).toMatchObject({ action: "stop" });
    expect(decideTriage({ ...safe, ownComment: true })).toMatchObject({ reaction: null });
    expect(decideTriage({ ...safe, verdict: "INACCURATE" })).toEqual({
      action: "present",
      reaction: "THUMBS_DOWN",
    });
    expect(decideTriage({ ...safe, viewerReactions: ["HEART"] })).toMatchObject({
      reaction: "THUMBS_UP",
    });
    expect(decideTriage({ ...safe, viewerReactions: ["THUMBS_UP"] })).toMatchObject({
      reaction: null,
    });
    expect(decideTriage({
      ...safe,
      verdict: "INACCURATE",
      viewerReactions: ["THUMBS_UP"],
    })).toMatchObject({ reaction: "THUMBS_DOWN" });
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

  test("binds writes to the resolved head and supports forks", () => {
    const context = verifyHead({
      url: "https://github.com/acme/widgets/pull/18",
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feature",
      headRepository: { nameWithOwner: "contributor/widgets" },
      currentBranch: "feature",
      pushRemote: "fork",
      pushRemoteUrl: "git@github.com:contributor/widgets.git",
      remotes: [
        { name: "fork", url: "git@github.com:contributor/widgets.git" },
        { name: "upstream", url: "https://github.com/acme/widgets.git" },
      ],
    });
    expect(context).toMatchObject({
      repository: "acme/widgets",
      pushRemote: "fork",
      pushUrl: "git@github.com:contributor/widgets.git",
      baseRemote: "upstream",
    });
    const remotes = [
      { name: "fork", url: "git@github.com:contributor/widgets.git" },
      { name: "upstream", url: "https://github.com/acme/widgets.git" },
    ];
    expect(() => verifyHead({ ...context, state: "OPEN", baseRefName: "main", url: context.url, headRefName: "other", headRepository: "contributor/widgets", currentBranch: "feature", pushRemoteUrl: "git@github.com:contributor/widgets.git", remotes })).toThrow(/current branch/);
    expect(() => verifyHead({ ...context, state: "CLOSED", baseRefName: "main", url: context.url, headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", pushRemoteUrl: "git@github.com:contributor/widgets.git", remotes })).toThrow(/OPEN/);
    expect(() => verifyHead({ ...context, state: "OPEN", baseRefName: "-bad", url: context.url, headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", pushRemoteUrl: "git@github.com:contributor/widgets.git", remotes })).toThrow(/base branch/);
    expect(() => verifyHead({ ...context, state: "OPEN", baseRefName: "main", url: context.url, headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", pushRemoteUrls: ["git@github.com:contributor/widgets.git", "https://github.com/contributor/widgets.git"], remotes })).toThrow(/exactly one/);
    const text = body();
    expect(text.indexOf("scripts/triage.mjs\" head")).toBeLessThan(text.indexOf("git push"));
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

  test("maps reactions idempotently and reports every item once", () => {
    const text = body();
    expect(text).toContain("THUMBS_UP");
    expect(text).toContain("THUMBS_DOWN");
    expect(text).toContain("Auto-applied");
    expect(text).toContain("Needs your decision");
    expect(existsSync(REPORT)).toBe(true);
    expect(read(REPORT)).toContain("Recommendation:");
  });
});
