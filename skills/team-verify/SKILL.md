---
name: team-verify
description: Dispatch 5 parallel reviewers against the implementation. Security review is a hard gate. Trigger on "verify the implementation", "run reviews", or "/team-verify".
---

# TEAM Verify — Standalone Phase

Run the VERIFY phase. Requires `implementation.completed` in the event log.

## Execution

1. Read `.team/events.jsonl`. Scan for `implementation.completed`.
2. If not found: report "No implementation to verify. Run /team-implement first." and stop.
3. Follow the event loop — dispatches 5 reviewers in parallel:
   `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`
4. At the aggregate gate: evaluate hard gates (security + verifier).
5. If hard gates fail and retries < 3: emit `hard-gate.failed`, loop to implementer.
6. **Stop after `verification.passed` or escalation.**

## Completion

Present all review verdicts and suggest: "/team-ship to commit and create PR"
