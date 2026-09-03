import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import {
  evaluateMergeability,
  evaluateSettlement,
  parseTarget,
  verifyHead,
} from "../skills/shipit/scripts/merge-state.mjs";

const PATH = join(process.cwd(), "skills", "shipit", "SKILL.md");
const MERGE_STATE = join(process.cwd(), "skills", "shipit", "scripts", "merge-state.mjs");
const text = () => (existsSync(PATH) ? read(PATH) : "");
const fm = () => frontmatter(text());

describe("shipit public contract", () => {
  test("keeps its invocation surface and explicit-intent guard", () => {
    const front = fm();
    expect(front).toMatch(/^name:\s*shipit$/m);
    expect(front).toMatch(/^effort:\s*medium$/m);
    expect(front).toMatch(/^argument-hint:\s*"<pr-number-or-url>"$/m);
    expect(front).toMatch(/^disable-model-invocation:\s*true$/m);
    for (const trigger of ['"ship it"', '"land the PR"', '"land this"', "/shipit"]) {
      expect(front).toContain(trigger);
    }
    expect(front).toMatch(/Invoke ONLY on explicit ship intent/i);
  });

  test("remains project-agnostic", () => {
    const body = text();
    for (const projectDetail of ["next-version.sh", "plugin.json", "marketplace.json", "[Unreleased]"]) {
      expect(body).not.toContain(projectDetail);
    }
  });

  test("orders push, bounded CI, final mergeability read, then merge", () => {
    const body = text();
    const push = body.indexOf("git push");
    const watch = body.indexOf("timeout 1800 gh pr checks");
    const verify = body.lastIndexOf("mergeStateStatus");
    const merge = body.indexOf('gh pr merge "$PR_URL"');
    expect(push).toBeGreaterThan(-1);
    expect(watch).toBeGreaterThan(push);
    expect(verify).toBeGreaterThan(watch);
    expect(merge).toBeGreaterThan(verify);
    expect(body).toContain("statusCheckRollup");
    expect(body).toContain("--watch --fail-fast --interval 30");
    expect(body).toContain("run_in_background: true");
    expect(body).toMatch(/\b124\b/);
    expect(body).toContain("scripts/merge-state.mjs");
  });

  test("parses one target and bounds settlement reads", () => {
    expect(parseTarget("21")).toMatchObject({ number: 21, repository: null });
    expect(parseTarget("https://github.com/acme/widgets/pull/22")).toMatchObject({
      number: 22,
      repository: "acme/widgets",
    });
    expect(() => parseTarget("21 --repo other/repo")).toThrow();
    expect(evaluateSettlement({ attempt: 1, mergeStateStatus: "UNKNOWN", checksComplete: false, checkCount: 0, zeroCheckReads: 0 }))
      .toEqual({ settled: false, exhausted: false, nextAttempt: 2, zeroCheckReads: 1, skipCheckWatch: false });
    expect(evaluateSettlement({ attempt: 6, mergeStateStatus: "UNKNOWN", checksComplete: false, checkCount: 0, zeroCheckReads: 5 }))
      .toEqual({ settled: false, exhausted: true, nextAttempt: null, zeroCheckReads: 6, skipCheckWatch: true });
    expect(evaluateSettlement({ attempt: 2, mergeStateStatus: "CLEAN", checksComplete: true, checkCount: 1, zeroCheckReads: 1 }))
      .toEqual({ settled: true, exhausted: false, nextAttempt: null, zeroCheckReads: 1, skipCheckWatch: false });
    expect(evaluateSettlement({ attempt: 2, mergeStateStatus: "CLEAN", checksComplete: true, checkCount: 0, zeroCheckReads: 1 }))
      .toEqual({ settled: false, exhausted: false, nextAttempt: 3, zeroCheckReads: 2, skipCheckWatch: false });
    expect(evaluateSettlement({ attempt: 6, mergeStateStatus: "CLEAN", checksComplete: true, checkCount: 0, zeroCheckReads: 4 }))
      .toMatchObject({ exhausted: true, zeroCheckReads: 5, skipCheckWatch: false });
    expect(() => evaluateSettlement({ attempt: 7, mergeStateStatus: "CLEAN", checksComplete: true, checkCount: 1, zeroCheckReads: 0 }))
      .toThrow(/1 through 6/);
  });

  test("maps mergeability state without constructing shell commands", () => {
    expect(evaluateMergeability({ state: "CLEAN", behindRebases: 0, unstableRetries: 0, unknownRetries: 0 }))
      .toEqual({ action: "merge" });
    expect(evaluateMergeability({ state: "HAS_HOOKS", behindRebases: 0, unstableRetries: 0, unknownRetries: 0 }))
      .toEqual({ action: "merge" });
    expect(evaluateMergeability({ state: "BEHIND", behindRebases: 0, unstableRetries: 0, unknownRetries: 0 }))
      .toEqual({ action: "rebase" });
    expect(evaluateMergeability({ state: "BEHIND", behindRebases: 1, unstableRetries: 0, unknownRetries: 0 }))
      .toEqual({ action: "stop" });
    expect(evaluateMergeability({ state: "UNSTABLE", behindRebases: 0, unstableRetries: 0, unknownRetries: 0 }))
      .toEqual({ action: "retry-ci" });
    expect(evaluateMergeability({ state: "UNSTABLE", behindRebases: 0, unstableRetries: 1, unknownRetries: 0 }))
      .toEqual({ action: "stop" });
    expect(evaluateMergeability({ state: "UNKNOWN", behindRebases: 0, unstableRetries: 0, unknownRetries: 0 }))
      .toEqual({ action: "reread" });
    expect(evaluateMergeability({ state: "BLOCKED", behindRebases: 0, unstableRetries: 0, unknownRetries: 0 }))
      .toEqual({ action: "stop" });
  });

  test("reads mergeability state from stdin", () => {
    const result = spawnSync(process.execPath, [MERGE_STATE, "mergeability"], {
      input: JSON.stringify({ state: "BEHIND", behindRebases: 0, unstableRetries: 0, unknownRetries: 0 }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ action: "rebase" });
    expect(result.stderr).toBe("");
  });

  test("permits only the documented merge states and squash command", () => {
    const body = text();
    expect(body).toContain("squashMergeAllowed");
    expect(body).toContain('--squash --subject "$TITLE (#$PR_NUMBER)"');
    expect(body).not.toMatch(/gh pr merge[^\n]*--body/);
    expect(body).toContain("Closes #...");
    expect(body).not.toContain("--yes");
  });

  test("uses lease-only behind recovery", () => {
    const body = text();
    const initialPush = body.indexOf('git push "${PUSH_REMOTE:?}" "${BRANCH:?}"');
    const remoteRead = body.indexOf('git ls-remote --heads "${PUSH_URL:?}"', initialPush);
    const rebase = body.indexOf('git rebase "${BASE_REMOTE:?}/${BASE:?}"', remoteRead);
    const lease = body.indexOf('git push --force-with-lease="${BRANCH:?}:${REMOTE_SHA_BEFORE:?}"', rebase);
    expect(initialPush).toBeGreaterThan(-1);
    expect(remoteRead).toBeGreaterThan(initialPush);
    expect(rebase).toBeGreaterThan(remoteRead);
    expect(lease).toBeGreaterThan(rebase);
    expect(body).toContain('git push --force-with-lease="${BRANCH:?}:${REMOTE_SHA_BEFORE:?}"');
    expect(body).toContain('git ls-remote --heads "${PUSH_URL:?}"');
  });

  test("verifies fork-aware head and base remotes before push", () => {
    const verified = verifyHead({
      url: "https://github.com/acme/widgets/pull/22",
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
    expect(() => verifyHead({ ...verified, state: "OPEN", url: verified.url, baseRefName: "main", headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", remotes: [{ name: "origin", url: "https://github.com/acme/widgets.git" }] })).toThrow(/push remote/);
    expect(() => verifyHead({ ...verified, state: "CLOSED", url: verified.url, baseRefName: "main", headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", remotes: [{ name: "origin", url: "git@github.com:contributor/widgets.git" }, { name: "upstream", url: "https://github.com/acme/widgets.git" }] })).toThrow(/OPEN/);
    expect(() => verifyHead({ ...verified, state: "OPEN", url: verified.url, baseRefName: "../main", headRefName: "feature", headRepository: "contributor/widgets", currentBranch: "feature", remotes: [{ name: "origin", url: "git@github.com:contributor/widgets.git" }, { name: "upstream", url: "https://github.com/acme/widgets.git" }] })).toThrow(/base branch/);
    expect(text().indexOf("scripts/merge-state.mjs\" head")).toBeLessThan(text().indexOf("git push"));
  });

  test("hands cleanup off for a separate explicit invocation", () => {
    const completion = text().slice(text().indexOf("## Completion"));
    expect(completion).toContain("Next: run `/pr-cleanup merged <PR URL>`");
    expect(completion).toMatch(/own explicit user\s+invocation/i);
    expect(completion).not.toContain("automatically");
  });
});
