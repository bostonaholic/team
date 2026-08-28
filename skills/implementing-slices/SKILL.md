---
name: implementing-slices
description: Slice-by-slice execution procedure for the implementer agent — dispatch modes (initial and review-fix), the slice-execution loop, TDD discipline, blocker handling, and the scope fence. Loaded when an implementation plan is executed or a hard-gate review failure needs fixing.
user-invocable: false
---

# Implementing Slices

The implementer's execution procedure: consume the plan, work through one
vertical slice at a time, and commit each slice atomically the moment its
tests pass.

## Dispatch modes

The orchestrator dispatches you with the artifact directory
`docs/plans/<id>/`.

### Initial dispatch (after the test-architect's failing tests are confirmed)

Your inputs are the plan (`docs/plans/<id>/plan.md` — slice list,
file-level steps, per-slice tests), the structure
(`docs/plans/<id>/structure.md` — order and verification checkpoints), the
failing acceptance tests (the completion contract), and
`docs/plans/<id>/repos.md` when present. `repos.md` defines multi-repo
mode: each repo's slug, absolute path, and worktree path (under
`## Worktrees`); every plan step annotated `[repo: <slug>]` is applied
inside that repo's worktree — `cd` there before running the step's edits,
tests, and commits. Before implementing, run the test suite once (in each
involved worktree, in multi-repo mode) to establish the baseline of
failing tests.

### Review-fix dispatch (after a hard-gate failure)

When dispatched after the aggregate gate fails, you are in a **fix loop**.
The orchestrator passes you a typed failure class and the reviewers'
findings. Fix what the findings name, under these constraints:

- **Security findings: never weaken the fix.** Fix each vulnerability
  directly — parameterize the query, remove the hardcoded secret, add the
  auth check, escape the output. The security reviewer re-checks with
  fresh eyes.
- **Test failures: fix the code, not the tests.** Tests are the
  contract — the implementation must satisfy them as written.
- **Code-review findings: do not argue with the review.** Fix what each
  `issue:` comment names.
- **Lint / format, typecheck, and build failures:** re-run the same check
  until it passes. Auto-fixable lint issues go through `--fix` first.
- When a failure is **non-obvious** — the cause is not plain from the
  error and the first fix you reach for is a guess — call the Skill tool
  with `systematic-debugging`
  and walk the
  **Root Cause Analysis (5 Whys)** causal chain to the root before
  editing, so you fix the root cause rather than the symptom. Skip this
  for an **obvious** failure (a typo, a trivially-named assertion, a
  clear one-line fix) — drilling a one-line fix is wasted ceremony. The
  fast path stays intact.

After fixing: re-run the full test suite so nothing regressed, address
every failure type reported in the round before reporting completion, and
report which findings were fixed and what changed. The orchestrator will
re-dispatch ALL 5 reviewers to verify your fixes.

## Slice-by-slice execution

Execute the plan one slice at a time, in the order the plan specifies. A
slice is done when its acceptance tests pass and prior slices' tests still
pass; commit it atomically at that moment, report it, and move on. The
contract per slice:

- **Steps.** The plan lists each slice's file-level steps. `[sequential]`
  steps depend on prior steps in the slice; `[parallel]` steps may be done
  in any order. In multi-repo mode each step carries `[repo: <slug>]` —
  cd into that repo's worktree before applying it. Cross-repo steps
  within one slice are routine — switch directories as needed.
- **Tests.** In multi-repo mode, run each acceptance test in the worktree
  where it lives (the test name in the plan carries a `<repo>:` prefix).
- **Commits.** Call the Skill tool with `git-commit` and apply its commit
  conventions (Conventional Commits, the 50/72 rule, one logical change per
  commit). Single-repo: one commit per slice
  using the slice's `Commit:` line as the subject, body referencing
  the design and structure paths. Multi-repo: when the slice's
  `Repos:` field names more than one repo, produce **one commit per
  repo** in their respective worktrees, using each per-repo `Commit:`
  subject from the plan. Each commit body references the same
  design/structure paths and notes "part of slice <N>: <name>" so
  reviewers can correlate.
- **Report.** Return a brief summary to the orchestrator per slice:
  `{slice: <name>, testsPassing: [list], commits: [
  {repo: <slug>, sha: <sha>}, ... ]}` (`commits` is a single-entry
  list in single-repo mode).

When all slices are done, return a final implementation summary to the
orchestrator (paths, slice list, final test status).

## TDD discipline within each slice

- Write the minimal code to make the slice's tests pass — no more.
- If a test requires functionality from a later slice, document the
  dependency but do not preempt that slice.
- Do not optimize or refactor until the slice's tests pass.
- If you find yourself writing code that no test exercises, stop and check
  if you are on scope.

## Handle blockers

If a slice is blocked (dependency missing, unclear requirement, test appears
incorrect):

1. **Document the blocker** — what is blocked, why, and what would unblock it.
2. **Continue with the next unblocked slice** if the structure allows it.
   Many slices depend on prior slices. Respect those dependencies.
3. **Return to blocked slices** after completing unblocked work, in case the
   blocker has been resolved.

## Scope fence

- **Do NOT change acceptance tests.** They are immutable. If a test seems
  wrong, document your concern but implement to make it pass as written.
- **Do NOT add slices beyond the plan.** If you see a missing slice, document
  it but do not implement it.
- **Do NOT refactor existing code** unless the plan explicitly calls for it.
- **Reference real file paths from the plan.** Do not invent new files or
  directories that the plan does not specify.
