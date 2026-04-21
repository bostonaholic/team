---
name: team-implement
description: Execute the plan slice by slice. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (5 parallel reviewers with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
---

# TEAM Implement — Standalone Phase

Run the IMPLEMENT phase. Requires `worktree.prepared` in the event log.

The Implement phase has three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with per-slice commits
3. **Adversarial review** — 5 parallel reviewers + aggregate hard-gate retry loop

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `worktree.prepared`.
2. If not found: report "No worktree prepared. Run /team-worktree first." and stop.
3. Follow the event loop from `skills/team/registry.json`:
   a. Dispatch `test-architect` → produces `tests.written`
   b. Mechanical gate: confirm all tests fail with assertion errors → `tests.confirmed-failing`
   c. Dispatch `implementer` → emits `slice.completed` per slice, then `implementation.completed`
   d. Dispatch 5 reviewers in parallel: `code-reviewer`, `security-reviewer`,
      `technical-writer`, `ux-reviewer`, `verifier`
   e. At the aggregate gate, evaluate hard gates (security + verifier + code-reviewer)
4. If any hard gate fails:
   - Emit typed failure events per gate:
     - Security: `hard-gate.security-failed`
     - Verifier: `hard-gate.lint-failed`, `hard-gate.typecheck-failed`,
       `hard-gate.build-failed`, `hard-gate.test-failed` (one per failing check)
     - Code review: `hard-gate.review-failed`
   - Count total `hard-gate.*-failed` events across all types in the log
   - If < 5 total: dispatch implementer to fix the specific findings,
     then re-dispatch ALL 5 reviewers for a complete fresh review
   - If >= 5 total: escalate to the team lead with a full summary of unresolved
     findings across all rounds, organized by type. Stop and wait for direction.
5. **Stop after `verification.passed` or escalation.**

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
