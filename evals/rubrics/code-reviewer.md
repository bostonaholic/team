---
agent: code-reviewer
---

# Code reviewer rubric

The code-reviewer agent is judged against these criteria, in order. Each
criterion declares its `kind`. Deterministic criteria are computed by the
harness from ground-truth.json; LLM criteria are scored by Sonnet-as-judge
on the agent's output.

1. Planted-bug detection (kind: deterministic). Score = fraction of seeded
   `bugs[]` whose `detection_hint` regex matches the agent's output.
2. Reasoning quality (kind: llm). 1-5 scale: does the agent point at a
   specific line, name the failure mode concretely, and recommend a fix
   that addresses the root cause? Anchors:
   - 1 = no concrete reference, generic prose.
   - 3 = names the bug category but no line / fix.
   - 5 = line reference, named failure mode, root-cause fix proposal.
