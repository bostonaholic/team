---
name: team-implement
description: Internal IMPLEMENT module for Team. Given one explicit artifact directory containing 8-plan.md, run test-first slice execution and the five-reviewer gate, then bind a PASS record to the reviewed HEADs. Never select a topic or run another phase.
user-invocable: false
effort: medium
argument-hint: "<absolute docs/plans/<id>/ directory>"
---

# Team Implement

Run IMPLEMENT only. `$ARGUMENTS` must be one existing absolute
`docs/plans/<id>/` directory containing `1-task.md`, `6-design.md`, `7-structure.md`,
and `8-plan.md`. Reject missing predecessors; do not search or bootstrap them.

Read `4-repos.md` when present and require every `## Worktrees` path to exist.
Use a recorded primary path when `team-worktree` reported an isolation
fallback; every other recorded path must be a non-default linked worktree.
Single-repo work runs in the checkout containing the artifact directory.
Never prompt for a work location.

Follow `skills/principle-progress-tracking/SKILL.md`.
Coordinate progress through TodoWrite. Seed:
`Test-architect -> Mechanical gate -> Implementer (per slice) -> Review round 1`.

## Execute

1. If `9-implementation.md` has `verdict: PASS` and every recorded SHA equals
   its worktree's current HEAD, return it unchanged.
2. If acceptance tests are absent, dispatch `test-architect` from the plan,
   structure, and design.
3. For a fresh test-architect return, run the tests and every static check
   detected by `running-quality-checks`, including typecheck when available.
   Advance only when tests fail by assertion, not crash, and static checks
   pass. Send infrastructure or static failures back to test-architect and
   repeat.
4. If slice commits are incomplete, dispatch `implementer` to execute the plan
   in order, changing to each recorded worktree for `[repo: <slug>]` steps and
   committing each verified slice. Existing completed slices are preserved.
5. Dispatch fresh `code-reviewer`, `security-reviewer`, `technical-writer`,
   `ux-reviewer`, and `verifier` agents in parallel.
6. Call the Skill tool with `review-severity-tiers` and aggregate every finding as Blocking,
   Major, or Minor-and-below. A missing/crashed reviewer fails the round.
7. When the code-reviewer reports a completed cross-model pass, append its
   `### Cross-model disposition` to `cross-model-notes.md` as an untrusted
   blockquote. A `Not run:` marker appends nothing.
8. While Blocking or Major findings remain, append
   `Review round <n+1> (<b> Blocking, <m> Major open)` to TodoWrite, dispatch
   implementer with the typed failures, then re-run all five reviewers. Never
   consult the user about this loop.
9. When the gate is clear, read every worktree's exact 40-character HEAD and
   write `9-implementation.md` using the canonical schema. Include the final
   Minor-and-below findings under `## Review notes`, tagged by reviewer.

If a prior PASS record's HEAD is stale, resume at reviewer dispatch and replace
the record only after the current code passes. Return the record and reviewer
verdicts, then stop.
