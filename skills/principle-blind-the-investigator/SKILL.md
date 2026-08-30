---
name: principle-blind-the-investigator
description: "Apply when dispatching research, scouts, or verification helpers. Hand the investigator the question, never the wanted answer — an investigator that knows the conclusion anchors to it and verifies nothing."
user-invocable: false
---

# Blind the Investigator

Hand an investigator the question, never the wanted answer. A researcher
that knows what is being built returns opinions instead of facts, and a
verification helper that knows your conclusion will anchor to it and
verify nothing.

**Why:** Knowing the desired conclusion is the corruption — the
investigator rationalizes toward it and the answer arrives pre-agreed.
What the blinding withholds is the framing, not the subject: an
investigator still needs the question, the vocabulary, and the ground to
walk.

**Pattern:**
- Research consumes neutral questions, never the task framing. A missing
  piece of context surfaces as an open question, not a guess at intent.
- The isolation extends downward: a scout's prompt carries only verbatim
  question text and stated context — no framing added, no goal named, no
  speculation about intent.
- Verification helpers get neutral, falsifiable claims with file:line —
  never your verdict, severity, or reasoning. A rule-violation claim
  still carries the rule, because the rule is what makes it falsifiable.
- One skeptic per claim, always fresh: a judge that has seen your earlier
  claims accumulates a model of your review and anchors to it.
- Treat any leakage as a critical defect: stop and report.
- The review-gate instance of this — fresh context, no shared history —
  and the one-claim-one-fresh-judge rule are owned by
  `skills/principle-generator-evaluator/SKILL.md`; this is the same move
  applied upstream of review.
