# technical-writer rubric

The happy case is scored with the generic `judgeQuality` axes (clarity /
completeness / actionability). The hallucination edge is scored
deterministically via `outcomeJudge` (no LLM judge).

1. Flags the user-facing documentation gaps for every new public surface in
   the frozen change set (functions, flags, env vars).
2. Grounds all prose in what the diff actually implements — never invents
   APIs, flags, or behavior the code does not show. The hallucination edge
   plants a fabricated-API phrase as a `detection_hint` the output must NOT
   contain; the eval asserts that id is in `outcome.missed`.
