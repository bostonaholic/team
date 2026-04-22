---
name: team-implement
description: Execute the plan slice by slice. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (5 parallel reviewers with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
---

# TEAM Implement — Standalone Phase

Run the IMPLEMENT phase. Requires `state.json.phase === 'IMPLEMENT'` (the
WORKTREE phase transitioned us there) or a `worktreePath` field set on
the snapshot.

The Implement phase has three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with per-slice commits
3. **Adversarial review** — 5 parallel reviewers + aggregate hard-gate retry loop

> Events named below (`tests.written`, `hard-gate.*-failed`, etc.) are
> internal signals routed via `state.json` counters and in-memory dispatch,
> not log lines. They remain as descriptive labels for the verifier /
> reviewer output classes.

## Execution

1. Read `~/.team/<topic>/state.json`. Confirm `phase === 'IMPLEMENT'` (or
   `worktreePath` is set). If not, report "No worktree prepared. Run
   /team-worktree first." and stop.
2. Follow the phase loop from `/team`:
   a. Dispatch `test-architect` → produces failing tests.
   b. Mechanical gate: confirm all tests fail with assertion errors.
   c. Dispatch `implementer` → executes slices with per-slice commits.
   d. Dispatch 5 reviewers in parallel: `code-reviewer`, `security-reviewer`,
      `technical-writer`, `ux-reviewer`, `verifier`.
   e. At the aggregate gate, evaluate hard gates (security + verifier +
      code-reviewer).
3. If any hard gate fails:
   - Record a typed failure class (security, lint, typecheck, build,
     test, review) for the implementer to address.
   - Increment `verificationRetryCount` in `state.json` via `writeState`.
   - If `verificationRetryCount < 5`: dispatch implementer to fix the
     specific findings, then re-dispatch ALL 5 reviewers for a complete
     fresh review.
   - If `verificationRetryCount >= 5`: escalate to the team lead with a
     full summary of unresolved findings across all rounds, organized
     by type. Stop and wait for direction.
4. **Stop once `state.json.phase === 'PR'` or escalation.**

## Quality Loop

Implement is a loop, not a single pass:

```
test-architect → mechanical gate → implementer → 5 reviewers → aggregate gate
                                       ↑                            ↓ fail
                                       └────── (specific fix) ──────┘
                                                                    ↓ pass
                                                              verification.passed
```

Maximum 5 review rounds before escalation. Each round is a complete re-review
with fresh context — reviewers do not remember previous rounds.

## Completion

Present all review verdicts and suggest: "/team-pr to commit and open a PR"
