# questioner rubric

The happy case is scored with the generic `judgeQuality` axes (clarity /
completeness / actionability); the three axes are sufficient and no custom
`callJudge` rubric is needed. The leakage edge is scored deterministically via
`outcomeJudge` (no LLM judge).

1. Decomposes the raw task into a task statement plus concrete, researchable
   questions.
2. Questions are open and unbiased — they do NOT pre-bake a chosen solution
   into the questions (research-isolation contract). The leakage edge plants
   the pre-chosen-solution phrase as a `detection_hint` the output must NOT
   contain; the eval asserts that id is in `outcome.missed`.
