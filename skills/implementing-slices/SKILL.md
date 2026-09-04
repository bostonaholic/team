---
name: implementing-slices
description: 'Defines implementing slices methodology. Load when agents need its procedure.'
user-invocable: false
---

# Implementing Slices

Consume `docs/plans/<id>/`, implement one vertical slice at a time, and commit each atomically when its tests pass.

## Dispatch modes

### Initial dispatch (after the test-architect's failing tests are confirmed)

Read `8-plan.md` (steps/tests), `7-structure.md` (order/checkpoints), immutable failing acceptance tests, and `4-repos.md` when present. In multi-repo mode, use each slug, absolute path, and `## Worktrees` path; execute every `[repo: <slug>]` step and prefixed test inside that worktree. Run the suite once in every involved worktree to confirm the failing baseline.

### Review-fix dispatch (after a hard-gate failure)

The orchestrator supplies a typed failure class and reviewer findings. Fix every named item:

- Security: fix the vulnerability directly—parameterize queries, remove secrets, add auth, escape output; never weaken the fix.
- Tests: change code, never the immutable tests. Code review: fix every `issue:`. Lint/format/typecheck/build: rerun until passing; use `--fix` first where available.
- For a non-obvious failure whose first fix is a guess, call `systematic-debugging` and complete **Root Cause Analysis (5 Whys)** (`principle-fix-root-causes`). Skip it for an obvious typo, named assertion, or one-line correction.

Then run the full suite, resolve every failure type from the round, and report each fix. The orchestrator re-dispatches ALL 5 reviewers.

## Slice-by-slice execution

- Follow plan order. `[sequential]` steps depend on prior steps; `[parallel]` steps may reorder. Switch repo worktrees for `[repo: <slug>]` steps and `<repo>:` tests.
- A slice finishes only when its acceptance tests and all prior-slice tests pass.
- Call `git-commit`: Conventional Commits, 50/72, one logical change. Single repo: one commit using the slice `Commit:` subject and citing design/structure paths. Multi-repo slice: one commit per named repo using its `Commit:` subject; each body cites the same paths and says `part of slice <N>: <name>`.
- Report `{slice: <name>, testsPassing: [list], commits: [{repo: <slug>, sha: <sha>}, ...]}`; single-repo has one commit entry. After all slices, return paths, slice list, and final test status.

## TDD and scope invariants

- Write only minimal code exercised by the current slice's tests. Do not preempt later slices; do not optimize/refactor before green. Stop if code has no test.
- Apply `principle-scope-fence`: the plan authorizes exactly its named changes. Do NOT change acceptance tests or invent files/directories absent from the plan. Record concerns but satisfy tests as written.

## Blockers

1. Record what is blocked, why, and the required unblocker.
2. Continue only with dependency-safe unblocked slices.
3. Revisit blocked slices after unblocked work completes.
