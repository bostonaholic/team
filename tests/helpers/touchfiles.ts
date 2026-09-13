// tests/helpers/touchfiles.ts
//
// Diff-based test selection. Maps test names to file globs; intersects
// against `git diff` to decide which tests need to run.

import { execFileSync } from "node:child_process";
import { test } from "bun:test";

export const E2E_TOUCHFILES: Record<string, string[]> = {
  "planted-null-deref": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",
    "skills/team/principles/independent-review.md",
    "skills/team/principles/verified-results.md",

    "skills/team/references/artifacts.md",
    "skills/team/references/external-data.md",
    "skills/reviewing-code/SKILL.md",
    "skills/conventional-comments/SKILL.md",
    "skills/engineering-standards/SKILL.md",
    "agents/code-reviewer.md",
    "skills/reviewing-code/**",
    "skills/conventional-comments/**",
    "tests/code-reviewer.evals.ts",
    "evals/fixtures/code-reviewer/planted-null-deref/**",
    "evals/rubrics/code-reviewer.md",
  ],
  "planted-time-bomb": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",
    "skills/team/principles/independent-review.md",
    "skills/team/principles/verified-results.md",

    "skills/team/references/artifacts.md",
    "skills/team/references/external-data.md",
    "skills/reviewing-code/SKILL.md",
    "skills/conventional-comments/SKILL.md",
    "skills/engineering-standards/SKILL.md",
    "agents/code-reviewer.md",
    "skills/reviewing-code/**",
    "skills/conventional-comments/**",
    "skills/test-style/**",
    "tests/code-reviewer.evals.ts",
    "evals/fixtures/code-reviewer/planted-time-bomb/**",
    "evals/rubrics/code-reviewer.md",
  ],
  // engineering-standards owns the comment rule content, so a change to it
  // can alter this fixture's outcome — it is a dep alongside the reviewer
  // agent and the severity skill.
  "planted-comment-violations": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",
    "skills/team/principles/independent-review.md",
    "skills/team/principles/verified-results.md",

    "skills/team/references/artifacts.md",
    "skills/team/references/external-data.md",
    "skills/reviewing-code/SKILL.md",
    "skills/conventional-comments/SKILL.md",
    "skills/engineering-standards/SKILL.md",
    "agents/code-reviewer.md",
    "skills/reviewing-code/**",
    "skills/conventional-comments/**",
    "skills/engineering-standards/**",
    "tests/code-reviewer.evals.ts",
    "evals/fixtures/code-reviewer/planted-comment-violations/**",
    "evals/rubrics/code-reviewer.md",
  ],
  "planted-comment-process-narration": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",
    "skills/team/principles/independent-review.md",
    "skills/team/principles/verified-results.md",

    "skills/team/references/artifacts.md",
    "skills/team/references/external-data.md",
    "skills/reviewing-code/SKILL.md",
    "skills/conventional-comments/SKILL.md",
    "skills/engineering-standards/SKILL.md",
    "agents/code-reviewer.md",
    "skills/reviewing-code/**",
    "skills/conventional-comments/**",
    "skills/engineering-standards/**",
    "tests/code-reviewer.evals.ts",
    "evals/fixtures/code-reviewer/planted-comment-process-narration/**",
    "evals/rubrics/code-reviewer.md",
  ],
  "git-commit-conventional-subject": [
    "skills/git-commit/**",
    "tests/git-commit.evals.ts",
    "evals/fixtures/git-commit/conventional-subject/**",
    "evals/rubrics/git-commit.md",
  ],
  "changelog-keep-a-changelog-filter": [
    "skills/changelog/**",
    "tests/changelog.evals.ts",
    "evals/fixtures/changelog/keep-a-changelog-filter/**",
    "evals/rubrics/changelog.md",
  ],
  "team-question-neutral-questions": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/independent-review.md",
    "skills/team/references/decisions.md",

    "skills/team/references/external-data.md",
    "skills/decomposing-intent/references/artifact-templates.md",
    "skills/decomposing-intent/SKILL.md",
    "skills/team/references/artifacts.md",
    "skills/team-question/**",
    "skills/decomposing-intent/**",
    "agents/questioner.md",
    "tests/team-question.evals.ts",
    "evals/fixtures/team-question/neutral-questions/**",
    "evals/rubrics/team-question.md",
  ],
  "eng-design-doc-review-planted-missing-alternatives": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",
    "skills/team/principles/independent-review.md",
    "skills/team/principles/verified-results.md",

    "skills/reviewing-designs/SKILL.md",
    "skills/reviewing-designs/references/review-brief.md",
    "skills/technical-design-doc/SKILL.md",
    "skills/documenting-decisions/SKILL.md",
    "skills/conventional-comments/SKILL.md",
    "skills/reviewing-code/SKILL.md",
    "skills/engineering-standards/SKILL.md",
    "skills/team/references/artifacts.md",
    "skills/eng-design-doc-review/**",
    "skills/reviewing-designs/**",
    "skills/technical-design-doc/**",
    "skills/documenting-decisions/**",
    "tests/eng-design-doc-review.evals.ts",
    "evals/fixtures/eng-design-doc-review/planted-missing-alternatives/**",
    "evals/rubrics/eng-design-doc-review.md",
  ],
  "team-fix-test-first-ordering": [
    "skills/team-fix/playbooks/bug-fix.md",
    "skills/team-fix/references/06-execution.md",
    "skills/team/principles/human-control.md",
    "skills/team/references/execution.md",
    "skills/test-driven-bug-fix/SKILL.md",
    "skills/test-driven-bug-fix/references/procedure.md",

    "skills/team-fix/**",
    "skills/test-driven-bug-fix/**",
    "skills/tracking-tickets/**",
    "tests/team-fix.evals.ts",
    "evals/fixtures/team-fix/test-first-ordering/**",
    "evals/rubrics/team-fix.md",
  ],
  // The four seeded-state evals share tests/helpers/seed.ts (extractSeed); a
  // change to it could alter any of their outcomes, so each lists it as a dep.
  "team-research-answers-seeded-questions": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/independent-review.md",
    "skills/team/principles/verified-results.md",

    "skills/finding-files/SKILL.md",
    "skills/researching-codebases/SKILL.md",
    "skills/team/references/artifacts.md",
    "skills/team-research/**",
    "skills/researching-codebases/**",
    "skills/finding-files/**",
    "agents/researcher.md",
    "tests/helpers/seed.ts",
    "tests/team-research.evals.ts",
    "evals/fixtures/team-research/answers-seeded-questions/**",
    "evals/rubrics/team-research.md",
  ],
  "team-design-seeded-research-and-task": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",
    "skills/team/references/decisions.md",

    "skills/team/references/external-data.md",
    "skills/systems-thinking/SKILL.md",
    "skills/decision-making/SKILL.md",
    "skills/authoring-designs/references/design-template.md",
    "skills/authoring-designs/SKILL.md",
    "skills/team/references/artifacts.md",
    "skills/team-design/**",
    "skills/authoring-designs/**",
    "agents/design-author.md",
    "tests/helpers/seed.ts",
    "tests/team-design.evals.ts",
    "evals/fixtures/team-design/seeded-research-and-task/**",
    "evals/rubrics/team-design.md",
  ],
  "team-structure-seeded-design": [
    "skills/team/principles/durable-state.md",

    "skills/systems-thinking/SKILL.md",
    "skills/slicing-work/references/structure-template.md",
    "skills/slicing-work/SKILL.md",
    "skills/team/references/artifacts.md",
    "skills/team-structure/**",
    "skills/slicing-work/**",
    "agents/structure-planner.md",
    "tests/helpers/seed.ts",
    "tests/team-structure.evals.ts",
    "evals/fixtures/team-structure/seeded-design/**",
    "evals/rubrics/team-structure.md",
  ],
  "team-plan-seeded-structure": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",

    "skills/systems-thinking/SKILL.md",
    "skills/engineering-standards/SKILL.md",
    "skills/planning-implementation/SKILL.md",
    "skills/team/references/artifacts.md",
    "skills/team-plan/**",
    "skills/planning-implementation/**",
    "agents/planner.md",
    "tests/helpers/seed.ts",
    "tests/team-plan.evals.ts",
    "evals/fixtures/team-plan/seeded-structure/**",
    "evals/rubrics/team-plan.md",
  ],
  "unslop-neutral-research": [
    "skills/team/principles/durable-state.md",
    "skills/team/principles/focused-work.md",
    "skills/team/principles/independent-review.md",
    "skills/team/principles/verified-results.md",
    "skills/team/references/decisions.md",

    "skills/team/references/external-data.md",
    "skills/team/references/artifacts.md",
    "agents/file-finder.md",
    "agents/questioner.md",
    "agents/researcher.md",
    "agents/technical-writer.md",
    "skills/conventional-comments/**",
    "skills/cross-model-review/**",
    "skills/documenting-decisions/**",
    "skills/engineering-standards/**",
    "skills/finding-files/**",
    "skills/team-research/**",
    "skills/team/**",
    "skills/nested-agents/**",
    "skills/team/references/external-data.md",
    "skills/team/references/execution.md",
    "skills/researching-codebases/**",
    "skills/reviewing-code/**",
    "skills/reviewing-designs/**",
    "skills/reviewing-documentation/**",
    "skills/systems-thinking/**",
    "skills/technical-design-doc/**",
    "skills/unslop/**",
    "skills/writing-prose/**",
    "tests/helpers/unslop-core.ts",
    "tests/helpers/unslop-cases.ts",
    "tests/unslop.evals.ts",
    "evals/fixtures/unslop/neutral-research/**",
    "evals/rubrics/unslop.md",
  ],
};

export const LLM_JUDGE_TOUCHFILES: Record<string, string[]> = {
  // populated as new judge-tier tests land
};

export const GLOBAL_TOUCHFILES: string[] = [
  "tests/helpers/session-runner.ts",
  "tests/helpers/eval-store.ts",
  "tests/helpers/touchfiles.ts",
  "tests/helpers/llm-judge.ts",
  "tests/helpers/fixtures.ts",
];

export const E2E_TIERS: Record<string, "gate" | "periodic"> = {
  // Live-model fixtures are periodic, and the gate slot stays empty by
  // decision — offline replay coverage lives in the free suite
  // (tests/code-reviewer-replay.test.ts), not behind a gate tier.
  "planted-null-deref": "periodic",
  "planted-time-bomb": "periodic",
  "planted-comment-violations": "periodic",
  "planted-comment-process-narration": "periodic",
  "git-commit-conventional-subject": "periodic",
  "changelog-keep-a-changelog-filter": "periodic",
  "team-question-neutral-questions": "periodic",
  "eng-design-doc-review-planted-missing-alternatives": "periodic",
  "team-fix-test-first-ordering": "periodic",
  "team-research-answers-seeded-questions": "periodic",
  "team-design-seeded-research-and-task": "periodic",
  "team-structure-seeded-design": "periodic",
  "team-plan-seeded-structure": "periodic",
  "unslop-neutral-research": "periodic",
};

const BASE_BRANCH_FALLBACKS = ["origin/main", "origin/master", "main", "master"];

export function detectBaseBranch(cwd: string = process.cwd()): string | null {
  const override = process.env.EVALS_BASE;
  if (override !== undefined && override !== "") {
    return override;
  }
  for (const candidate of BASE_BRANCH_FALLBACKS) {
    try {
      execFileSync("git", ["rev-parse", "--verify", candidate], {
        cwd,
        stdio: ["ignore", "ignore", "ignore"],
      });
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

export function getChangedFiles(baseBranch: string | null, cwd: string = process.cwd()): string[] | null {
  if (process.env.EVALS_FAKE_GIT_DIFF_FAIL === "1") return null;
  if (process.env.EVALS_FAKE_CHANGED_FILES !== undefined) {
    return process.env.EVALS_FAKE_CHANGED_FILES.split(",").filter((s) => s.length > 0);
  }
  if (baseBranch === null) return null;
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", `${baseBranch}...HEAD`],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return out.split("\n").filter((s) => s.length > 0);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Glob matcher: supports `*` (single segment, no slash) and `**` (zero or
// more segments). Sufficient for fixture-style patterns.
// ---------------------------------------------------------------------------

export function globToRegex(pattern: string): RegExp {
  let out = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === undefined) {
      // unreachable; pacifies noUncheckedIndexedAccess
      continue;
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      out += "\\" + ch;
    } else if (ch === "/") {
      out += "\\/";
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out);
}

export function globMatch(pattern: string, file: string): boolean {
  return globToRegex(pattern).test(file);
}

// ---------------------------------------------------------------------------
// selectTests — produces the final set of test names to run.
// ---------------------------------------------------------------------------

export interface SelectionResult {
  selected: Set<string>;
  skipped: Set<string>;
  reason: string;
}

export function selectTests(
  changedFiles: string[] | null,
  touchfiles: Record<string, string[]>,
  globalTouchfiles: string[],
): SelectionResult {
  const allTests = new Set(Object.keys(touchfiles));

  if (process.env.EVALS_ALL === "1") {
    return { selected: allTests, skipped: new Set(), reason: "EVALS_ALL=1" };
  }

  if (changedFiles === null) {
    return {
      selected: allTests,
      skipped: new Set(),
      reason: "git diff failed; running everything",
    };
  }

  if (changedFiles.some((f) => globalTouchfiles.includes(f))) {
    return {
      selected: allTests,
      skipped: new Set(),
      reason: "global touchfile changed",
    };
  }

  if (changedFiles.length === 0) {
    return {
      selected: new Set(),
      skipped: allTests,
      reason: "no changed files",
    };
  }

  const selected = new Set<string>();
  const skipped = new Set<string>();
  for (const [name, patterns] of Object.entries(touchfiles)) {
    let matched = false;
    for (const pattern of patterns) {
      const re = globToRegex(pattern);
      for (const file of changedFiles) {
        if (re.test(file)) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) selected.add(name);
    else skipped.add(name);
  }
  return { selected, skipped, reason: "diff-based" };
}

// ---------------------------------------------------------------------------
// EVALS_TIER filter — applied AFTER selection. Tests whose tier does not
// match the env filter are dropped from the selected set.
// ---------------------------------------------------------------------------

export function filterByTier<TName extends string>(
  selected: Set<TName>,
  tiers: Record<TName, "gate" | "periodic">,
  envTier: string | undefined = process.env.EVALS_TIER,
): Set<TName> {
  if (envTier === undefined || envTier === "") return selected;
  if (envTier !== "gate" && envTier !== "periodic") {
    throw new Error(
      `EVALS_TIER must be one of gate|periodic; got '${envTier}'`,
    );
  }
  const out = new Set<TName>();
  for (const name of selected) {
    if (tiers[name] === envTier) out.add(name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Memoized selection — call once per process, cache the result.
// ---------------------------------------------------------------------------

let _selectedE2E: Set<string> | null = null;

export function getSelectedE2ETests(): Set<string> {
  if (_selectedE2E !== null) return _selectedE2E;
  const base = detectBaseBranch();
  const changed = getChangedFiles(base);
  const sel = selectTests(changed, E2E_TOUCHFILES, GLOBAL_TOUCHFILES);
  const filtered = filterByTier(sel.selected, E2E_TIERS as Record<string, "gate" | "periodic">);
  _selectedE2E = filtered;
  return filtered;
}

// Re-export for testing.
export function _resetMemoForTests(): void {
  _selectedE2E = null;
}

// ---------------------------------------------------------------------------
// testIfSelected — bun-test wrapper that consults the selector. A paid eval
// file calls this instead of `test(...)` directly so that EVALS_TIER and
// diff-based selection actually gate execution. When the named test is not
// in the selected set, it is registered as `test.skip` (visible, but not
// run — and not billed). EVALS_ALL=1 selects everything.
// ---------------------------------------------------------------------------

export function testIfSelected(
  name: string,
  fn: () => void | Promise<void>,
  timeoutMs?: number,
): void {
  const runner = getSelectedE2ETests().has(name) ? test : test.skip;
  if (timeoutMs === undefined) runner(name, fn);
  else runner(name, fn, timeoutMs);
}
