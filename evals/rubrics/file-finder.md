---
agent: file-finder
---

# File-finder rubric

The file-finder agent is judged against these criteria. Each criterion
declares its `kind`. Deterministic criteria are computed by the harness from
`ground-truth.json` via `outcomeJudge`; the `detection_hint` of each planted
target is a case-insensitive regex matched against the agent's output.

1. Planted-path detection (kind: deterministic). Score = fraction of the
   seeded target `bugs[]` whose `detection_hint` path-regex matches the
   agent's output. A correct run reports every real target path.
2. No hallucinated paths (kind: deterministic). On an empty or unanswerable
   request the agent surfaces that no target exists rather than fabricating a
   path; the empty-input case asserts the planted path is NOT emitted, so a
   no-op cannot trivially score.
