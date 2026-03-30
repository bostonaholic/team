---
name: team-verify
description: Dispatch 5 parallel reviewers against the implementation. Security review is a hard gate. Trigger on "verify the implementation", "run reviews", or "/team-verify".
---

# TEAM Verify — Standalone Phase

Run the VERIFY phase. Requires `implementation.completed` in the event log.

## Execution

1. Read `~/.team/events.jsonl`. Scan for `implementation.completed`.
2. If not found: report "No implementation to verify. Run /team-implement first." and stop.
3. Follow the event loop — dispatches 5 reviewers in parallel:
   `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`
4. At the aggregate gate: evaluate hard gates (security + verifier + code-reviewer).
5. If any hard gate fails:
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
6. **Stop after `verification.passed` or escalation.**

## Quality Loop

The verify phase is a loop, not a single pass:

```
IMPLEMENT → VERIFY (5 reviewers) → gate check
                ↓ fail                ↓ pass
            IMPLEMENT             SHIP
            (fix findings)
```

Maximum 5 rounds before escalation. Each round is a complete re-review with
fresh context — reviewers do not remember previous rounds.

## Completion

Present all review verdicts and suggest: "/team-ship to commit and create PR"
