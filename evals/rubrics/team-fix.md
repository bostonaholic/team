---
agent: team-fix
---

# team-fix rubric

The team-fix pipeline must follow the test-first ordering
`REPRODUCE → RED → GREEN → VERIFY → SHIP`. The deterministic axis confirms a
failing-test step is mentioned; the ordering property (failing test BEFORE the
fix) is graded by the LLM judge.

1. Failing-test step present (kind: deterministic). The output must reference a
   failing test / RED phase, matched by the `ground-truth.json`
   `detection_hint` via `outcomeJudge` — no model call. Pass = detection_rate ≥
   `minimum_detection`.
2. Test-first ordering (kind: llm). 1-5 scale, scored only when the
   deterministic check passes (gated cascade). Judges whether the failing test
   that reproduces the bug appears BEFORE the minimal fix, and whether the fix
   is minimal (does not rewrite unrelated code). Anchors:
   - 1 = jumps straight to the fix with no failing test, or fix precedes test.
   - 3 = a test and a fix both appear but ordering is ambiguous.
   - 5 = failing test that reproduces the bug is written first, then a minimal
     fix, then a verify step — in that order.
