// tests/pr-rebase-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-rebase` RUNTIME skill
// (skills/pr-rebase/SKILL.md) — a standalone "bring the branch up to date
// without changing its behavior" action distributed to Team's users.
//
// The skill's whole value is a chain of guards around two irreversible acts
// (a history rewrite and a force-push). Each assertion below pins one link
// of that chain.
//
// These assert CONTRACTS, never wording: frontmatter keys, the commands and
// flags the skill tells the model to emit, the ORDER of two commands, the
// section headings, and forbidden command forms. A documentation rewrite
// that keeps the commands correct must stay green — so nothing here matches
// a sentence. The forbidden-command checks scan fenced code lines only,
// because every one of those strings legitimately appears in prose that
// forbids it.
//
// Every assertion is guarded so a not-yet-existing skill file yields a
// failed expect(), never an uncaught ENOENT — the mechanical gate rejects
// crashes, not clean assertion failures.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();
// pr-rebase is a RUNTIME skill — it lives under skills/ (distributed), not .claude/.
const PR_REBASE_SKILL = join(REPO_ROOT, "skills", "pr-rebase", "SKILL.md");

// Defensive read: missing file → "" so content assertions FAIL (not throw).
function body(): string {
  return existsSync(PR_REBASE_SKILL) ? read(PR_REBASE_SKILL) : "";
}
function fm(): string {
  return existsSync(PR_REBASE_SKILL) ? frontmatter(read(PR_REBASE_SKILL)) : "";
}

/** Every line inside a fenced code block — what the model is told to RUN. */
function fencedLines(): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of body().split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) out.push(line);
  }
  return out;
}

/** Index of the first fenced line matching `re`, or -1. Used for ordering. */
function fencedIndex(re: RegExp): number {
  return fencedLines().findIndex((line) => re.test(line));
}

describe("pr-rebase skill: frontmatter and invocation surface", () => {
  test("skill file lives under runtime skills/ (distributed)", () => {
    expect(existsSync(PR_REBASE_SKILL)).toBe(true);
  });

  test("frontmatter declares name: pr-rebase", () => {
    expect(/^name:\s*pr-rebase\s*$/m.test(fm())).toBe(true);
  });

  test("frontmatter sets disable-model-invocation: true (user-invocable only)", () => {
    // The push rewrites published history and no later verification undoes
    // that for a teammate holding the branch, so only a deliberate human
    // invocation starts the run.
    const f = fm();
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:\s*true\s*$/m.test(f)).toBe(true);
  });

  test("argument-hint declares both the PR selector and --yes", () => {
    const f = fm();
    expect(/^argument-hint:.*pr-number/m.test(f)).toBe(true);
    expect(/^argument-hint:.*--yes/m.test(f)).toBe(true);
  });

  test("description carries the guard carrier, a quoted phrase, and the slash name", () => {
    // The guard carrier string and the phrase-plus-slash-name shape are the
    // documented routing contract for a side-effecting entry point
    // (architecture.md). The specific phrases are free to change.
    const f = fm().replace(/\s+/g, " ");
    expect(f.length).toBeGreaterThan(0);
    expect(f).toContain("Invoke ONLY on explicit");
    expect(/"[^"]+"/.test(f)).toBe(true);
    expect(f).toContain("/pr-rebase");
  });

  test("references the progress-tracking convention", () => {
    expect(body()).toContain("skills/progress-tracking/SKILL.md");
  });

  test("section headings appear in the documented order", () => {
    const t = body();
    const order = ["## Input", "## Hard rules", "## Execution", "## Completion"];
    const positions = order.map((heading) => t.indexOf(heading));
    for (const position of positions) expect(position).toBeGreaterThan(-1);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

describe("pr-rebase skill: base-branch discovery is a chain, never a bare main", () => {
  test("resolves the base through gh -> origin/HEAD -> main", () => {
    const lines = fencedLines().join("\n");
    expect(lines).toContain("gh pr view");
    expect(lines).toContain("--json baseRefName");
    expect(lines).toContain("git symbolic-ref refs/remotes/origin/HEAD");
    expect(lines).toContain("BASE=main");
  });

  test("the base-resolving gh call forwards the PR selector", () => {
    // Without the selector, an explicit PR argument is silently ignored and
    // the base comes from the CURRENT branch's PR instead.
    const ghLine = fencedLines().find(
      (line) => line.includes("gh pr view") && line.includes("baseRefName"),
    );
    expect(ghLine).toBeDefined();
    expect(ghLine ?? "").toContain('${PR:+"$PR"}');
  });

  test("externally sourced branch names pass a character allowlist", () => {
    const t = body();
    expect(t).toContain("LC_ALL=C");
    expect(t).toContain("[!A-Za-z0-9._/-]");
    expect(t).toContain("git check-ref-format --branch");
  });

  test("treats PR prose as data, not instructions", () => {
    expect(body()).toContain("## Untrusted input");
  });
});

describe("pr-rebase skill: the two remotes are resolved separately", () => {
  test("derives the push remote from the branch's upstream", () => {
    const lines = fencedLines().join("\n");
    expect(lines).toContain("@{upstream}");
    expect(lines).toContain("PUSH_REMOTE=");
    expect(lines).toContain("BASE_REMOTE=");
  });

  test("cross-checks the push target against the PR's head repository", () => {
    expect(fencedLines().join("\n")).toContain("headRepositoryOwner");
  });

  test("the rebase and merge-base target BASE_REMOTE, never a hardcoded origin", () => {
    const rebaseLine = fencedLines().find((line) => /^\s*git rebase\s+"/.test(line));
    expect(rebaseLine).toBeDefined();
    expect(rebaseLine ?? "").toContain("${BASE_REMOTE:?}");
    expect(fencedLines().join("\n")).toContain(
      'MERGE_BASE="$(git merge-base HEAD "${BASE_REMOTE:?}/${BASE:?}")"',
    );
  });
});

describe("pr-rebase skill: pre-rebase refusals", () => {
  test("detects a dirty tree, an in-progress operation, and a detached HEAD", () => {
    const t = body();
    expect(t).toContain("git status --porcelain");
    expect(t).toContain("git rebase --show-current-patch");
    expect(t).toContain("MERGE_HEAD");
    expect(t).toContain("CHERRY_PICK_HEAD");
    expect(t).toContain("git branch --show-current");
  });

  test("matches protected branch names case-insensitively", () => {
    const t = body();
    expect(t).toContain("release/*");
    expect(t).toContain("tr '[:upper:]' '[:lower:]'");
  });
});

describe("pr-rebase skill: the baseline gate", () => {
  test("captures the recovery anchor and the pre-fetch remote tip", () => {
    const lines = fencedLines().join("\n");
    expect(lines).toContain('ORIG_SHA="$(git rev-parse HEAD)"');
    expect(lines).toContain("REMOTE_SHA_BEFORE=");
    // The recovery command is quoted inline, not fenced — it is what the
    // skill reports to the user, not a step it runs.
    expect(body()).toContain("git reset --hard");
  });

  test("the lease ref is read from PUSH_REMOTE, not origin", () => {
    const leaseLine = fencedLines().find((line) =>
      line.includes("REMOTE_SHA_BEFORE="),
    );
    expect(leaseLine).toBeDefined();
    expect(leaseLine ?? "").toContain("${PUSH_REMOTE:?}");
  });

  test("the baseline is captured BEFORE the fetch", () => {
    // Ordering tripwire: a baseline taken after the fetch measures a tree
    // that already moved, and the lease value would be worthless.
    const anchor = fencedIndex(/ORIG_SHA="\$\(git rev-parse HEAD\)"/);
    const fetch = fencedIndex(/^\s*git fetch /);
    expect(anchor).toBeGreaterThan(-1);
    expect(fetch).toBeGreaterThan(-1);
    expect(anchor).toBeLessThan(fetch);
  });

  test("runs the project's detected checks via running-quality-checks", () => {
    expect(body()).toContain("skills/running-quality-checks/SKILL.md");
  });

  test("offloads the baseline and resolutions to docs/plans/<id>/rebase-<n>.md", () => {
    const t = body();
    expect(t).toContain("docs/plans/");
    expect(t).toContain("rebase-<n>.md");
    expect(t).toContain("skills/artifact-frontmatter/SKILL.md");
  });
});

describe("pr-rebase skill: conflict resolution", () => {
  test("reads all three merge stages", () => {
    // The stage reads are what survive the rebase ours/theirs inversion —
    // they name the sides positionally instead of by the flag names.
    const t = body();
    expect(t).toContain('git show ":1:<path>"');
    expect(t).toContain('git show ":2:<path>"');
    expect(t).toContain('git show ":3:<path>"');
  });

  test("bounds both sides' history with MERGE_BASE", () => {
    const lines = fencedLines().join("\n");
    expect(lines).toContain("git log --oneline");
    expect(lines).toContain("${MERGE_BASE:?}");
  });

  test("escalates through AskUserQuestion", () => {
    expect(body()).toContain("AskUserQuestion");
  });

  test("continues the rebase with a non-interactive editor", () => {
    // Without GIT_EDITOR, `git rebase --continue` dies with "Terminal is
    // dumb, but EDITOR unset" in a non-interactive shell and strands the
    // rebase mid-flight.
    const continueLine = fencedLines().find((line) =>
      line.includes("git rebase --continue"),
    );
    expect(continueLine).toBeDefined();
    expect(continueLine ?? "").toContain("GIT_EDITOR=true");
  });

  test("the marker check runs before git add, which runs before --continue", () => {
    // Ordering tripwire: `git diff --cached --check` ahead of `git add`
    // inspects an empty staged diff and passes vacuously.
    const grep = fencedIndex(/git grep .*<\{7\}/);
    const add = fencedIndex(/^\s*git add -- "<path>"/);
    const check = fencedIndex(/git diff --cached --check/);
    const cont = fencedIndex(/git rebase --continue/);
    for (const index of [grep, add, check, cont]) expect(index).toBeGreaterThan(-1);
    expect(grep).toBeLessThan(add);
    expect(add).toBeLessThan(check);
    expect(check).toBeLessThan(cont);
  });
});

describe("pr-rebase skill: forbidden command forms never appear as instructions", () => {
  // Forbidden-pattern tripwires over FENCED LINES only. Each of these strings
  // appears in prose that forbids it, which is correct and must stay allowed;
  // what must never happen is one showing up as a command to run.

  test("no fenced line runs git rebase --skip", () => {
    expect(fencedLines().filter((line) => /git rebase --skip/.test(line))).toEqual([]);
  });

  test("no fenced line runs git checkout --ours/--theirs", () => {
    expect(
      fencedLines().filter((line) => /git checkout --(ours|theirs)/.test(line)),
    ).toEqual([]);
  });

  test("no fenced line runs a force-push without a lease", () => {
    const bare = fencedLines().filter(
      (line) =>
        /git push/.test(line) &&
        /--force\b/.test(line) &&
        !/--force-with-lease/.test(line) &&
        !/--force-if-includes/.test(line),
    );
    expect(bare).toEqual([]);
  });

  test("no fenced line merges the PR (landing belongs to /shipit)", () => {
    expect(fencedLines().filter((line) => /gh pr merge/.test(line))).toEqual([]);
    expect(body()).toContain("/shipit");
  });
});

describe("pr-rebase skill: the verification gate", () => {
  test("the comparison table enumerates all three baseline states", () => {
    const t = body();
    expect(t).toContain("| BASELINE | AFTER | Verdict |");
    expect(t).toContain("UNKNOWN");
  });

  test("range-diff is available as a failure diagnostic", () => {
    expect(body()).toContain("git range-diff");
  });

  test("verification is ordered after the rebase and before the push", () => {
    const t = body();
    const rebaseStep = t.indexOf("### Step 4");
    const verifyStep = t.indexOf("### Step 6");
    const pushStep = t.indexOf("### Step 7");
    for (const position of [rebaseStep, verifyStep, pushStep]) {
      expect(position).toBeGreaterThan(-1);
    }
    expect(rebaseStep).toBeLessThan(verifyStep);
    expect(verifyStep).toBeLessThan(pushStep);
  });
});

describe("pr-rebase skill: the push form", () => {
  test("pushes with an explicit lease value plus --force-if-includes", () => {
    // A bare --force-with-lease reads the remote-tracking ref, which this
    // skill's own fetch already advanced — so the implicit form would
    // authorize clobbering a push we fetched but never integrated.
    const t = body();
    expect(t).toContain('--force-with-lease="${BRANCH:?}:${REMOTE_SHA_BEFORE:?}"');
    expect(t).toContain("--force-if-includes");
  });

  test("the push targets PUSH_REMOTE, and so does the never-pushed fallback", () => {
    const pushLines = fencedLines().filter((line) => /^\s*git push/.test(line));
    expect(pushLines.length).toBeGreaterThan(0);
    for (const line of pushLines) expect(line).toContain("${PUSH_REMOTE:?}");
  });

  test("every push expands its variables with the abort-on-unset form", () => {
    for (const line of fencedLines().filter((l) => /^\s*git push/.test(l))) {
      expect(line).toContain("${BRANCH:?}");
    }
  });
});
