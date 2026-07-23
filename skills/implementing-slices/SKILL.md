---
name: implementing-slices
description: Slice-by-slice execution procedure for the implementer agent — dispatch modes (initial and review-fix), the slice-execution loop, TDD discipline, blocker handling, and the scope fence. Loaded when an approved implementation plan is executed or a hard-gate review failure needs fixing.
user-invocable: false
---

# Implementing Slices

The implementer's execution procedure: consume the approved plan, execute
one vertical slice at a time, and commit each slice atomically the moment
its tests pass.

## Dispatch modes

The orchestrator dispatches you with the artifact directory
`docs/plans/<id>/`.

### Initial dispatch (after the test-architect's failing tests are confirmed)

1. **Read the approved plan** at `docs/plans/<id>/plan.md` to understand the
   slice list, file-level steps, and per-slice tests.
2. **Read the structure** at `docs/plans/<id>/structure.md` to
   understand the order and verification checkpoints.
3. **Read `docs/plans/<id>/repos.md` if present.** It defines multi-repo
   mode and lists each repo's slug, absolute path, and worktree path
   (under `## Worktrees`). When present, every step that carries a
   `[repo: <slug>]` annotation in the plan is applied inside that
   repo's worktree — `cd` to the worktree path before running the
   step's edits, tests, and commits.
4. **Read the failing acceptance tests** to understand the completion contract.
   Run the test suite once (in each involved worktree, in multi-repo
   mode) to establish the baseline of failing tests.

### Review-fix dispatch (after a hard-gate failure)

When dispatched after the aggregate gate fails, you are in a **fix loop**.
The orchestrator passes you a typed failure class telling you what to fix:

#### Security failure
Security vulnerabilities (CRITICAL or HIGH severity) were found.
1. Read the security reviewer's findings the orchestrator passed in.
2. Fix each vulnerability directly — parameterize queries, remove hardcoded
   secrets, add auth checks, escape output, etc.
3. Do not weaken the fix. The security reviewer will re-check with fresh eyes.

#### Lint / format failure
Format or lint checks failed.
1. Read the linter error output and failing rules.
2. Fix each violation — auto-fixable issues first (`--fix`), then manual fixes.
3. Re-run the format/lint check to confirm it passes.

#### Typecheck failure
Type checking failed (e.g., `tsc --noEmit`).
1. Read the type errors — file paths, line numbers, error codes.
2. Fix each type error — add missing types, fix mismatched signatures, resolve
   import issues.
3. Re-run the type checker to confirm it passes.

#### Build failure
Production build failed.
1. Read the build error output.
2. Fix the build errors — missing dependencies, broken imports, config issues.
3. Re-run the build command to confirm it succeeds.

#### Test failure
Test suite has failing tests.
1. Read the failing test names and assertion output.
2. Fix the code (not the tests) to make failing tests pass. Tests are the
   contract — the implementation must satisfy them.
3. Re-run the full test suite to confirm all tests pass.

When a test, lint, or typecheck failure is **non-obvious** — the cause is not
plain from the error and the first fix you reach for is a guess — Load
`skills/systematic-debugging/SKILL.md` and walk the **Root Cause Analysis
(5 Whys)** causal chain to the root before editing, so you fix the root cause
rather than the symptom. Skip this for an **obvious** failure (a typo, a
trivially-named assertion, a clear one-line fix) — drilling a one-line fix is
wasted ceremony; the fast path stays intact.

#### Code-review failure
Code review found blocking quality issues (REQUEST CHANGES verdict).
1. Read the reviewer's `issue:` comments.
2. Fix each blocking issue — correctness bugs, missing error handling,
   naming problems, unnecessary complexity, SOLID violations.
3. Do not argue with the review — fix the code.

### Common to all fix dispatches

- **Re-run the full test suite** after fixes to ensure nothing regressed.
- **Report which findings were fixed** and what changed.
- If multiple failure types were reported in the same round, address all of
   them before reporting completion.
- The orchestrator will re-dispatch ALL 5 reviewers to verify your fixes.

## Slice-by-slice execution

Execute the plan one slice at a time, in the order the plan specifies.

For each slice:

1. **Read the slice spec** — the plan lists its acceptance tests, the
   file-level steps, and (multi-repo) the slice's `Repos:` field.
2. **Implement the steps within the slice** in the order given. Steps marked
   `[parallel]` may be done in any order; `[sequential]` steps depend on
   prior steps in the slice. In multi-repo mode, each step carries
   `[repo: <slug>]`; cd into that repo's worktree before applying the
   step. Cross-repo steps within one slice are routine — switch
   directories as needed.
3. **Run the slice's acceptance tests.** When they all pass and prior
   slices' tests still pass, the slice is done. In multi-repo mode, run
   each test in the worktree where it lives (the test name in the plan
   carries a `<repo>:` prefix).
4. **Commit atomically.** Single-repo: one commit per slice using the
   slice's `Commit:` line as the subject, body referencing the design
   and structure paths. Multi-repo: when the slice's `Repos:` field
   names more than one repo, produce **one commit per repo** in their
   respective worktrees, using each per-repo `Commit:` subject from the
   plan. Each commit body references the same design/structure paths
   and notes "part of slice <N>: <name>" so reviewers can correlate.
5. **Report the slice as complete** — return a brief summary to the
   orchestrator: `{slice: <name>, testsPassing: [list], commits: [
   {repo: <slug>, sha: <sha>}, ... ]}` (`commits` is a single-entry
   list in single-repo mode).
6. **Move to the next slice.**

When all slices are done, return a final implementation summary to the
orchestrator (paths, slice list, final test status).

## TDD discipline within each slice

- Write the minimal code to make the slice's tests pass — no more.
- If a test requires functionality from a later slice, document the
  dependency but do not preempt that slice.
- Do not optimize or refactor until the slice's tests pass.
- If you find yourself writing code that no test exercises, stop and check
  whether you are on scope.

## Handle blockers

If a slice is blocked (dependency missing, unclear requirement, test appears
incorrect):

1. **Document the blocker** — what is blocked, why, and what would unblock it.
2. **Continue with the next unblocked slice** if the structure allows it.
   Many slices depend on prior slices; respect those dependencies.
3. **Return to blocked slices** after completing unblocked work, in case the
   blocker has been resolved.

## Scope fence

- **Do NOT modify acceptance tests.** They are immutable. If a test seems
  wrong, document your concern but implement to make it pass as written.
- **Do NOT add slices beyond the plan.** If you see a missing slice, document
  it but do not implement it.
- **Do NOT refactor existing code** unless the plan explicitly calls for it.
- **Reference real file paths from the plan.** Do not invent new files or
  directories that the plan does not specify.
