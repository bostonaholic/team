# researcher rubric

The happy case is scored with the generic `judgeQuality` axes (clarity /
completeness / actionability). The isolation edge is scored deterministically
via `outcomeJudge` (no LLM judge).

1. Answers each question from the actual codebase with file:line evidence and
   the relevant exported symbol.
2. Stays isolated — answers ONLY from the questions and the code, never
   echoing the user's task framing. The isolation edge plants the task-framing
   phrase as a `detection_hint` the output must NOT contain; the eval asserts
   that id is in `outcome.missed`.
