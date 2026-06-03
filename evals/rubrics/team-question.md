---
agent: team-question
---

# team-question rubric

The QUESTION phase produces neutral research questions (`questions.md`). The
deterministic axis confirms questions were emitted at all; the load-bearing
neutrality property is graded by the LLM judge (it is a negative property — the
*absence* of feature framing — which a positive regex cannot capture).

1. Research questions emitted (kind: deterministic). The output must contain at
   least one line ending in a question mark, matched by the
   `ground-truth.json` `detection_hint` via `outcomeJudge` — no model call.
   Pass = detection_rate ≥ `minimum_detection`.
2. Research-neutral framing (kind: llm). 1-5 scale, scored only when the
   deterministic check passes (gated cascade). Judges whether the questions
   leak the feature framing — a researcher reading only the questions should
   not be able to tell the feature is a rate limiter. Anchors:
   - 1 = questions name the feature directly ("rate limiting", "429",
     "Retry-After", "plan tier").
   - 3 = mostly neutral but one question hints at the solution.
   - 5 = every question asks about current codebase behavior with no leakage
     of the intended feature.
