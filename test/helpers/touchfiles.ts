// test/helpers/touchfiles.ts
//
// Diff-based test selection. Maps test names to file globs; intersects
// against `git diff` to decide which tests need to run.

import { execFileSync } from "node:child_process";
import { test } from "bun:test";

export const E2E_TOUCHFILES: Record<string, string[]> = {
  "planted-null-deref": [
    "agents/code-reviewer.md",
    "skills/code-review/**",
  ],
};

export const LLM_JUDGE_TOUCHFILES: Record<string, string[]> = {
  // populated as new judge-tier tests land
};

export const GLOBAL_TOUCHFILES: string[] = [
  "test/helpers/session-runner.ts",
  "test/helpers/eval-store.ts",
  "test/helpers/touchfiles.ts",
  "test/helpers/llm-judge.ts",
  "test/helpers/fixtures.ts",
];

export const E2E_TIERS: Record<string, "gate" | "periodic"> = {
  // Note: gate-tier E2E tests would do offline assertions (e.g. against a
  // recorded transcript). The single live fixture is periodic.
  "planted-null-deref": "periodic",
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
// EVALS_TIER filter — applied AFTER selection. Tests whose tier doesn't
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
