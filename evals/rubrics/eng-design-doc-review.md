---
agent: eng-design-doc-review
---

# eng-design-doc-review rubric

This skill dispatches a fresh-context adversarial review of a design doc and
relays Conventional-Comments findings plus a verdict. It is the closest analog
to the code-reviewer eval, so it reuses the same deterministic-first cascade.

1. Planted-gap detection (kind: deterministic). Score = fraction of seeded
   `bugs[]` whose `detection_hint` regex matches the review output. The planted
   gap is Decision 1's missing alternative / unstated trade-off. Computed by
   `outcomeJudge` — no model call. Pass = detection_rate ≥ `minimum_detection`.
2. Review substance (kind: llm). 1-5 scale, scored only when a Conventional
   Comment label is present (gated by `judgeReviewerOutput`). Judges whether
   the review points at a specific section/line, names the design weakness
   concretely, and ends with a defensible verdict. Anchors:
   - 1 = generic prose, no concrete reference, no verdict.
   - 3 = names the gap category but no section reference or verdict.
   - 5 = section reference, named failure mode, REQUEST CHANGES verdict tied to
     the blocking issues.
