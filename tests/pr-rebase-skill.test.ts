// tests/pr-rebase-skill.test.ts
//
// L2 tripwire (free, deterministic): fences the `pr-rebase` RUNTIME skill
// (skills/pr-rebase/SKILL.md) — a standalone "bring the branch up to date
// without changing its behavior" action distributed to Team's users.
//
// The skill's whole value is a chain of guards around two irreversible-ish
// acts (a history rewrite and a force-push). Each assertion below pins one
// link of that chain: the user-only invocation flag, the baseline-then-
// compare gate, the conflict-resolution rules, and the exact push form.
// Per docs/testing.md §2, these assert CONTRACTS — frontmatter keys, the
// commands and flags the skill tells the model to emit, and section
// headings — never wording.
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
// Collapse whitespace runs so prose wrapped across indented lines can be
// matched by a single-space regex.
function flat(text: string): string {
  return text.replace(/\s+/g, " ");
}
// A named section's text, or "" when absent — assertions against "" fail cleanly.
function section(heading: string): string {
  const text = body();
  const start = text.indexOf(heading);
  if (start < 0) return "";
  const rest = text.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
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
    // invocation starts the run (architecture.md: a side-effecting skill
    // "should set disable-model-invocation where the host honors it").
    const f = fm();
    expect(f.length).toBeGreaterThan(0);
    expect(/^disable-model-invocation:\s*true\s*$/m.test(f)).toBe(true);
  });

  test("frontmatter declares argument-hint (registers as a slash command)", () => {
    expect(/^argument-hint:/m.test(fm())).toBe(true);
  });

  test("description carries explicit-intent guard wording plus trigger phrases", () => {
    // Side-effecting skills replace the plain "Trigger on" carrier with
    // shipit-style guard wording, while still naming the phrases and the
    // literal slash name (architecture.md, methodology-skills section).
    const f = flat(fm());
    expect(f.length).toBeGreaterThan(0);
    expect(/Invoke ONLY on explicit/.test(f)).toBe(true);
    expect(/never infer/i.test(f)).toBe(true);
    expect(/"rebase onto main"/.test(f)).toBe(true);
    expect(f).toContain("/pr-rebase");
  });

  test("references the progress-tracking convention", () => {
    expect(body()).toContain("skills/progress-tracking/SKILL.md");
  });
});

describe("pr-rebase skill: base-branch discovery is a chain, never a bare main", () => {
  test("resolves the base through gh -> origin/HEAD -> main", () => {
    const t = flat(body());
    expect(t).toContain("gh pr view --json baseRefName");
    expect(t).toContain("git symbolic-ref refs/remotes/origin/HEAD");
    expect(/BASE=main/.test(t)).toBe(true);
  });

  test("externally sourced branch names pass a character allowlist", () => {
    // A PR's baseRefName is attacker-chosen on a public repo; the allowlist
    // (and LC_ALL=C, without which the bracket expression is collation-
    // dependent) is what makes it safe to place in a command.
    const t = body();
    expect(t).toContain("LC_ALL=C");
    expect(t).toContain("[!A-Za-z0-9._/-]");
    expect(t).toContain("git check-ref-format --branch");
  });

  test("treats PR prose as data, not instructions", () => {
    expect(body()).toContain("## Untrusted input");
  });
});

describe("pr-rebase skill: pre-rebase refusals", () => {
  const hardRules = () => section("## Hard rules");
  const refusals = () => body();

  test("refuses a dirty tree via git status --porcelain", () => {
    expect(refusals()).toContain("git status --porcelain");
  });

  test("refuses a detached HEAD", () => {
    expect(/detached HEAD/.test(refusals())).toBe(true);
  });

  test("refuses an operation already in progress", () => {
    const t = refusals();
    expect(t).toContain("git rebase --show-current-patch");
    expect(t).toContain("MERGE_HEAD");
    expect(t).toContain("CHERRY_PICK_HEAD");
  });

  test("refuses a protected branch as the rebase target, matched case-insensitively", () => {
    const t = body();
    expect(t).toContain("release/*");
    expect(t).toContain("tr '[:upper:]' '[:lower:]'");
  });

  test("hard rules forbid rebasing a protected branch and assuming main", () => {
    const rules = hardRules();
    expect(rules.length).toBeGreaterThan(0);
    expect(/Never rebase a protected branch/.test(rules)).toBe(true);
    expect(/Never assume the base is `main`/.test(rules)).toBe(true);
  });
});

describe("pr-rebase skill: the baseline gate", () => {
  test("captures the recovery anchor before anything is rewritten", () => {
    const t = flat(body());
    expect(t).toContain("ORIG_SHA");
    expect(t).toContain("git reset --hard");
  });

  test("captures the pre-fetch remote tip as the explicit lease value", () => {
    // Captured BEFORE step 3's fetch — that ordering is the whole reason the
    // lease is trustworthy, so the variable name is pinned.
    expect(body()).toContain("REMOTE_SHA_BEFORE");
  });

  test("runs the project's detected checks via running-quality-checks", () => {
    expect(body()).toContain("skills/running-quality-checks/SKILL.md");
  });

  test("classifies an unrunnable check UNKNOWN and bars it as evidence", () => {
    const t = flat(body());
    expect(t).toContain("UNKNOWN");
    expect(/no baseline proves nothing after/i.test(t)).toBe(true);
  });

  test("offloads the baseline and resolutions to docs/plans/<id>/rebase-<n>.md", () => {
    const t = body();
    expect(t).toContain("docs/plans/");
    expect(t).toContain("rebase-<n>.md");
    expect(t).toContain("skills/artifact-frontmatter/SKILL.md");
  });
});

describe("pr-rebase skill: conflict resolution rules", () => {
  test("names the rebase ours/theirs inversion explicitly", () => {
    // The single most common way a rebase silently discards the author's
    // work. The three stage reads are the check that survives the confusion.
    const t = flat(body());
    expect(/`--ours` is the upstream base and `--theirs` is your own commit/.test(t)).toBe(
      true,
    );
    expect(t).toContain('git show ":1:<path>"');
    expect(t).toContain('git show ":2:<path>"');
    expect(t).toContain('git show ":3:<path>"');
  });

  test("forbids git rebase --skip", () => {
    expect(/Never `git rebase --skip`/.test(body())).toBe(true);
  });

  test("forbids wholesale side-picking and routes generated files to regeneration", () => {
    const t = flat(body());
    expect(/Never resolve a conflict by picking a side wholesale/.test(t)).toBe(true);
    expect(/regenerat/i.test(t)).toBe(true);
  });

  test("escalates an undecidable hunk through AskUserQuestion without aborting", () => {
    const t = flat(body());
    expect(t).toContain("AskUserQuestion");
    expect(/Do \*\*not\*\* abort the whole rebase over one hunk/.test(t)).toBe(true);
  });

  test("delegates a large conflicted file to a read-only subagent", () => {
    expect(/subagent/.test(body())).toBe(true);
  });

  test("proves no conflict markers survive before continuing", () => {
    const t = body();
    expect(t).toContain("git diff --cached --check");
    expect(t).toContain("git rebase --continue");
  });
});

describe("pr-rebase skill: the verification gate", () => {
  test("compares AFTER against BASELINE and names PASS->FAIL a regression", () => {
    const t = flat(body());
    expect(t).toContain("BASELINE");
    expect(/regression/i.test(t)).toBe(true);
  });

  test("compares at the level of individual test names, not suite exit status", () => {
    expect(/individual test names/.test(flat(body()))).toBe(true);
  });

  test("a regression hard-stops before the push", () => {
    const rules = section("## Hard rules");
    expect(rules.length).toBeGreaterThan(0);
    expect(/Never push without the verification gate/.test(rules)).toBe(true);
    expect(/no ungated path to the remote/i.test(flat(rules))).toBe(true);
  });

  test("offers range-diff only as a failure diagnostic, not a required step", () => {
    const t = flat(body());
    expect(t).toContain("git range-diff");
    expect(/diagnostic to reach for on failure, not a required step/.test(t)).toBe(true);
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

  test("forbids a bare git push --force", () => {
    const t = flat(body());
    expect(/Never a bare `git push --force`/.test(t)).toBe(true);
    expect(/Never retry with a bare `--force`/.test(t)).toBe(true);
  });

  test("requires a pre-push confirmation that --yes is the caller's to pass", () => {
    const t = flat(body());
    expect(/explicit confirmation/.test(t)).toBe(true);
    expect(/the caller's to pass/.test(t)).toBe(true);
  });

  test("degrades to a plain push when the branch was never pushed", () => {
    expect(body()).toContain('git push -u origin "${BRANCH:?}"');
  });

  test("surfaces a rejection verbatim", () => {
    expect(/verbatim/.test(body())).toBe(true);
  });
});

describe("pr-rebase skill: scope fence", () => {
  test("does not merge, and hands landing to /shipit", () => {
    const t = flat(body());
    expect(t).not.toContain("gh pr merge");
    expect(t).toContain("/shipit");
  });

  test("destructive sinks re-derive their variables and use the ${VAR:?} form", () => {
    const rules = section("## Hard rules");
    expect(rules.length).toBeGreaterThan(0);
    expect(/No destructive command relies on a variable set in an earlier Bash/.test(rules)).toBe(
      true,
    );
    expect(rules).toContain("${VAR:?}");
  });
});
