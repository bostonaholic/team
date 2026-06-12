# structure-planner rubric

Scored with the generic `judgeQuality` axes (clarity / completeness /
actionability); the three axes are sufficient for a structure artifact and no
custom `callJudge` rubric is needed.

1. Breaks the frozen design into vertical, independently testable slices,
   each with an explicit acceptance / test signal.
2. Keeps every slice traceable to a component or signal stated in the design;
   does not invent scope the design does not justify.
3. On an ambiguous design, surfaces explicit assumptions and open questions
   (`## Assumptions` / `## Open Questions`) and declines to fabricate slices.
