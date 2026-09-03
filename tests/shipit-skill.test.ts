import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";
import {
  evaluateMergeability,
  evaluateSettlement,
  parsePushRepository,
  parseTarget,
  validateBinding,
  validateRebasePreflight,
} from "../skills/shipit/scripts/merge-state.mjs";

const PATH = join(process.cwd(), "skills", "shipit", "SKILL.md");
const MERGE_STATE = join(process.cwd(), "skills", "shipit", "scripts", "merge-state.mjs");
const text = () => (existsSync(PATH) ? read(PATH) : "");
const fm = () => frontmatter(text());
const SHA_A = "a".repeat(40);

describe("shipit public contract", () => {
  test("keeps its invocation surface and explicit-intent guard", () => {
    const front = fm();
    expect(front).toMatch(/^name:\s*shipit$/m);
    expect(front).toMatch(/^effort:\s*medium$/m);
    expect(front).toMatch(/^argument-hint:.*pr-number/m);
    expect(front).not.toMatch(/^disable-model-invocation:/m);
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

  test("accepts the current branch or one number and bounds settlement reads", () => {
    expect(parseTarget("")).toEqual({ target: null, number: null });
    expect(parseTarget("21")).toEqual({ target: "21", number: 21 });
    const invalid = [
      "0",
      "9007199254740992",
      "21 --repo other/repo",
      "https://github.com/acme/widgets/pull/22",
    ];
    for (const target of invalid) {
      expect(() => parseTarget(target)).toThrow();
    }
    expect(evaluateSettlement({ attempt: 1, mergeStateStatus: "UNKNOWN", checkCount: 0 }))
      .toEqual({ settled: false, exhausted: false, action: "wait", nextAttempt: 2 });
    expect(evaluateSettlement({ attempt: 1, mergeStateStatus: "CLEAN", checkCount: 0 }))
      .toEqual({ settled: false, exhausted: false, action: "wait", nextAttempt: 2 });
    expect(evaluateSettlement({ attempt: 6, mergeStateStatus: "CLEAN", checkCount: 0 }))
      .toEqual({ settled: false, exhausted: true, action: "skip-checks", nextAttempt: null });
    expect(evaluateSettlement({ attempt: 6, mergeStateStatus: "UNKNOWN", checkCount: 0 }))
      .toEqual({ settled: false, exhausted: true, action: "stop", nextAttempt: null });
    expect(evaluateSettlement({ attempt: 2, mergeStateStatus: "CLEAN", checkCount: 1 }))
      .toEqual({ settled: true, exhausted: false, action: "watch", nextAttempt: null });
    expect(() => evaluateSettlement({ attempt: 7, mergeStateStatus: "CLEAN", checkCount: 1 }))
      .toThrow(/1 through 6/);
    expect(() => evaluateSettlement({ attempt: 1, mergeStateStatus: "CLEAN", checkCount: -1 }))
      .toThrow(/non-negative integer/);
  });

  test("reads raw targets only from stdin without executing them", () => {
    const directory = mkdtempSync(join(tmpdir(), "team-shipit-target-"));
    const marker = join(directory, "injected");
    try {
      const empty = spawnSync(process.execPath, [MERGE_STATE, "target"], {
        input: "",
        encoding: "utf8",
      });
      expect(empty.status).toBe(0);
      expect(JSON.parse(empty.stdout)).toEqual({ target: null, number: null });

      const injected = spawnSync(process.execPath, [MERGE_STATE, "target"], {
        input: `21; touch ${marker}`,
        encoding: "utf8",
      });
      expect(injected.status).toBe(2);
      expect(existsSync(marker)).toBe(false);
      expect(text()).not.toContain('target "$ARGUMENTS"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds fork heads to their push remote and discovers the base remote", () => {
    expect(parsePushRepository("git@github.com:forker/widgets.git")).toBe("forker/widgets");
    const metadata = {
      url: "https://github.com/upstream/widgets/pull/25",
      number: 25,
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feature",
      headRefOid: SHA_A,
      headRepository: { name: "widgets", nameWithOwner: "forker/widgets" },
      headRepositoryOwner: { login: "forker" },
    };
    const context = {
      currentBranch: "feature",
      pushRemote: "origin",
      pushRemoteUrls: ["git@github.com:forker/widgets.git"],
      remoteUrls: {
        origin: ["git@github.com:forker/widgets.git"],
        upstream: ["https://github.com/upstream/widgets.git"],
      },
    };
    expect(validateBinding(metadata, context)).toMatchObject({
      canonicalUrl: metadata.url,
      owner: "upstream",
      headRepository: "forker/widgets",
      headOid: SHA_A,
      branch: "feature",
      base: "main",
      pushRemote: "origin",
      pushUrl: "git@github.com:forker/widgets.git",
      baseRemote: "upstream",
    });
    expect(() => validateBinding(metadata, { ...context, currentBranch: "other" }))
      .toThrow(/current branch/);
    expect(() => validateBinding(metadata, {
      ...context,
      pushRemoteUrls: ["git@github.com:upstream/widgets.git"],
    })).toThrow(/push remote/);
    expect(() => validateBinding(metadata, {
      ...context,
      pushRemoteUrls: [
        "git@github.com:forker/widgets.git",
        "https://github.com/other/widgets.git",
      ],
    })).toThrow(/multiple repository identities/);
    expect(() => validateBinding({ ...metadata, state: "MERGED" }, context)).toThrow(/open/);
    expect(() => validateBinding({ ...metadata, baseRefName: "" }, context)).toThrow(/base/);
    expect(() => validateBinding({ ...metadata, baseRefName: "-unsafe" }, context)).toThrow(/base/);
    expect(validateBinding({
      ...metadata,
      headRepository: { name: "widgets", nameWithOwner: "upstream/widgets" },
      headRepositoryOwner: { login: "upstream" },
    }, {
      ...context,
      pushRemoteUrls: ["git@github.com:upstream/widgets.git"],
      remoteUrls: { origin: ["https://github.com/other/widgets.git"] },
    })).toMatchObject({ baseRemote: null });

    const directory = mkdtempSync(join(tmpdir(), "team-shipit-bind-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "feature"], { cwd: directory }).status).toBe(0);
      expect(spawnSync("git", ["remote", "add", "origin", "https://github.com/upstream/widgets.git"], {
        cwd: directory,
      }).status).toBe(0);
      expect(spawnSync("git", ["config", "remote.origin.pushurl", context.pushRemoteUrls[0]!], { cwd: directory }).status).toBe(0);
      const bound = spawnSync(process.execPath, [MERGE_STATE, "bind"], {
        cwd: directory,
        input: JSON.stringify(metadata),
        encoding: "utf8",
      });
      expect(bound.status).toBe(0);
      expect(JSON.parse(bound.stdout)).toMatchObject({
        pushRemote: "origin",
        pushUrl: "git@github.com:forker/widgets.git",
        baseRemote: "origin",
        currentBranch: "feature",
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("captures the validated push tip and requires exact BEHIND preflight identity", () => {
    const metadata = {
      url: "https://github.com/upstream/widgets/pull/25",
      number: 25,
      state: "OPEN",
      baseRefName: "main",
      headRefName: "feature",
      headRefOid: SHA_A,
      headRepository: { name: "widgets", nameWithOwner: "forker/widgets" },
      headRepositoryOwner: { login: "forker" },
    };
    const binding = validateBinding(metadata, {
      currentBranch: "feature",
      pushRemote: "origin",
      pushRemoteUrls: ["git@github.com:forker/widgets.git"],
      remoteUrls: { origin: ["https://github.com/upstream/widgets.git"] },
    });
    const fresh = { ...metadata, mergeStateStatus: "BEHIND" };
    expect(validateRebasePreflight({
      binding,
      metadata: fresh,
      localHead: SHA_A,
      remoteSha: SHA_A,
    })).toEqual({ remoteShaBefore: SHA_A, headOid: SHA_A });
    expect(() => validateRebasePreflight({
      binding,
      metadata: fresh,
      localHead: SHA_A,
      remoteSha: "b".repeat(40),
    })).toThrow(/disagree/);
    expect(() => validateRebasePreflight({
      binding,
      metadata: { ...fresh, state: "CLOSED" },
      localHead: SHA_A,
      remoteSha: SHA_A,
    })).toThrow(/no longer open/);

    const directory = mkdtempSync(join(tmpdir(), "team-shipit-remote-head-"));
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
      const result = spawnSync(process.execPath, [MERGE_STATE, "remote-head"], {
        input: JSON.stringify({
          pushUrl: "git@github.com:forker/widgets.git",
          pushRepository: "forker/widgets",
          branch: "feature",
        }),
        encoding: "utf8",
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TEAM_REMOTE_TRACE: trace },
      });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({ remoteSha: SHA_A });
      expect(readFileSync(trace, "utf8")).toBe(
        "ls-remote\n--heads\n--\ngit@github.com:forker/widgets.git\nrefs/heads/feature\n",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  test("binds before push and uses the canonical URL for every later PR call", () => {
    const body = text();
    const bind = body.indexOf('scripts/merge-state.mjs" bind');
    const push = body.indexOf('git push -- "${PUSH_REMOTE:?}"', bind);
    const checks = body.indexOf('gh pr checks "$PR_URL"', push);
    const merge = body.indexOf('gh pr merge "$PR_URL"', checks);
    expect(bind).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(bind);
    expect(checks).toBeGreaterThan(push);
    expect(merge).toBeGreaterThan(checks);
    expect(body.slice(bind)).not.toMatch(/gh pr (?:view|checks|merge) "\$PR_NUMBER"/);
  });

  test("maps mergeability state without constructing shell commands", () => {
    expect(evaluateMergeability({ state: "CLEAN", unstableRetries: 0, unknownRetries: 0, behindRebases: 0 }))
      .toEqual({ action: "merge" });
    expect(evaluateMergeability({ state: "HAS_HOOKS", unstableRetries: 0, unknownRetries: 0, behindRebases: 0 }))
      .toEqual({ action: "merge" });
    expect(evaluateMergeability({ state: "BEHIND", unstableRetries: 0, unknownRetries: 0, behindRebases: 0 }))
      .toEqual({ action: "rebase" });
    expect(evaluateMergeability({ state: "BEHIND", unstableRetries: 0, unknownRetries: 0, behindRebases: 1 }))
      .toEqual({ action: "stop" });
    expect(() => evaluateMergeability({ state: "BEHIND", unstableRetries: 0, unknownRetries: 0, behindRebases: 2 }))
      .toThrow(/behindRebases/);
    expect(evaluateMergeability({ state: "UNSTABLE", unstableRetries: 0, unknownRetries: 0, behindRebases: 0 }))
      .toEqual({ action: "retry-ci" });
    expect(evaluateMergeability({ state: "UNSTABLE", unstableRetries: 1, unknownRetries: 0, behindRebases: 0 }))
      .toEqual({ action: "stop" });
    expect(evaluateMergeability({ state: "UNKNOWN", unstableRetries: 0, unknownRetries: 0, behindRebases: 0 }))
      .toEqual({ action: "reread" });
    expect(evaluateMergeability({ state: "BLOCKED", unstableRetries: 0, unknownRetries: 0, behindRebases: 0 }))
      .toEqual({ action: "stop" });
  });

  test("reads mergeability state from stdin", () => {
    const result = spawnSync(process.execPath, [MERGE_STATE, "mergeability"], {
      input: JSON.stringify({
        state: "BEHIND",
        unstableRetries: 0,
        unknownRetries: 0,
        behindRebases: 0,
        prose: "$(touch should-not-run)",
      }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ action: "rebase" });
    expect(result.stderr).toBe("");
  });

  test("permits only the documented merge states and squash command", () => {
    const body = text();
    expect(body).toContain("squashMergeAllowed");
    expect(body).toContain('gh pr merge "$PR_URL" --squash --subject "$TITLE (#$PR_NUMBER)"');
    expect(body).not.toMatch(/gh pr merge[^\n]*--body/);
    expect(body).toContain("Closes #...");
    expect(body).not.toContain("--yes");
  });

  test("uses lease-only behind recovery", () => {
    const body = text();
    expect(body).toContain('git rebase "${BASE_REMOTE:?}/$BASE"');
    expect(body).toContain('--force-with-lease="refs/heads/${HEAD_REF_NAME:?}:${REMOTE_SHA_BEFORE:?}"');
    expect(body).not.toContain("git push --force-with-lease --");
    expect(body).toContain('scripts/merge-state.mjs" remote-head');
    expect(body).toContain('scripts/merge-state.mjs" rebase-preflight');
  });

  test("runs only merged cleanup after a successful merge", () => {
    const completion = text().slice(text().indexOf("## Completion"));
    expect(completion).toContain("/pr-cleanup");
    expect(completion).toContain("<canonical PR URL>");
    expect(completion).toContain("Mode A");
    expect(completion).toMatch(/Never .*Mode B automatically/i);
    expect(completion).toMatch(/Only after a successful merge/i);
  });
});
