---
agent: test-architect
---

# Test-architect rubric

The test-architect agent is judged against these criteria. Deterministic
criteria are computed by the harness from `ground-truth.json` via
`outcomeJudge`; each planted `detection_hint` is a case-insensitive regex
matched against the agent's output.

1. Untested-branch coverage (kind: deterministic). Score = fraction of the
   seeded `bugs[]` (each a real coverage gap) whose `detection_hint` regex
   matches the agent's output. A correct test-architect identifies the
   below-threshold branch and proposes an acceptance test for it.
2. No fabrication on empty input (kind: deterministic). The `empty-input`
   case has no code to analyze; the agent must surface that the request is
   empty rather than inventing a branch, so the eval asserts the planted hint
   is NOT emitted and the case does not pass the minimum.
