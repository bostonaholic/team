---
agent: security-reviewer
---

# Security-reviewer rubric

The security-reviewer agent is judged against these criteria. Deterministic
criteria are computed by the harness from `ground-truth.json` via
`outcomeJudge`; each planted `detection_hint` is a case-insensitive regex
matched against the agent's output.

1. Planted-vulnerability detection (kind: deterministic). Score = fraction of
   the seeded `bugs[]` whose `detection_hint` regex matches the agent's
   output. A correct reviewer names the SQL injection in the unsafe handler.
2. False-positive discipline (kind: deterministic). On the `safe-pattern`
   case the query is parameterized and therefore safe; the reviewer must NOT
   report an injection. The eval asserts the safe-pattern bug id is in
   `outcome.missed` (i.e. not "detected") and honors `max_false_positives`,
   so a trigger-happy reviewer fails this criterion.
