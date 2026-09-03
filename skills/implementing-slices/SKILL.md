---
name: implementing-slices
description: Execute 8-plan.md one slice at a time or fix hard review findings. Loaded by implementer.
user-invocable: false
---

# Implementing Slices

## Input

The dispatch names `docs/plans/<id>/` and one mode.

### Initial

Read `8-plan.md`, `7-structure.md`, the failing acceptance tests, and `4-repos.md`
when present. Before editing, run the test suite once in every involved
worktree to confirm the failing baseline.

In multi-repo mode, `4-repos.md` maps repo slugs to worktrees. Run every
`[repo: <slug>]` step, test, and commit from that worktree.

### Review fix

The dispatch supplies a typed failure class and findings. Resolve every
finding from the round:

- Security: fix the vulnerability directly; never weaken the fix.
- Tests: fix code, not tests.
- Code review: fix every `issue:`.
- Format, lint, typecheck, build: rerun the same check to green; try the
  linter's auto-fix first when applicable.
- Non-obvious failures: call the Skill tool with `systematic-debugging` and
  trace the Root Cause Analysis (5 Whys) before editing
  (`skills/principle-fix-root-causes/SKILL.md`). Skip it for an obvious typo
  or clear one-line correction.

Then run the full suite and report each finding and its fix. The orchestrator
re-runs all five reviewers.

## Required actions

Process slices in plan order. For each slice:

1. Execute its file-level steps. `[sequential]` preserves order;
   `[parallel]` may run in any order. Change worktrees at `[repo: <slug>]`.
2. Run that slice's acceptance tests in the repo where each test lives, plus
   prior slices' tests.
3. When all pass, call the Skill tool with `git-commit`. Single-repo work gets
   one commit using the slice's `Commit:` subject and a body citing the design
   and structure paths. A slice spanning repos gets one commit per repo using
   each repo's `Commit:` subject; each body cites the same artifacts and says
   `part of slice <N>: <name>`.
4. Report:

   `{slice: <name>, testsPassing: [<tests>], commits: [{repo: <slug>, sha: <sha>}]}`

Within a slice:

- Write only the minimum code needed for its tests.
- Do not preempt later slices; record the dependency.
- Do not optimize or refactor before green.
- Stop and check scope if code has no test.

If blocked, record what, why, and the unblock condition. Continue only with
independent slices, then retry the blocked slice.

## Scope fence

Apply `skills/principle-scope-fence/SKILL.md`.

- Never change acceptance tests. Record a concern, but satisfy them as written.
- Use the real paths in the plan. Do not invent unspecified files or directories.

## Done

Every slice's tests pass, prior tests still pass, each slice has its required
per-repo commit, and the final report lists paths, slices, commits, and full-suite
status.
