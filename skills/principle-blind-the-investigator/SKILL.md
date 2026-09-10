---
name: principle-blind-the-investigator
description: 'Keeps desired outcomes out of research prompts. Apply when dispatching research, scouting, or verification.'
user-invocable: false
---

# Blind the Investigator

Give investigators the question, vocabulary, and evidence source; withhold the wanted answer and framing.

- Research from neutral questions, never the task framing; surface missing context as an open question, not guessed intent.
- Restrict task-derived scout content to verbatim question text, stated
  `Codebase context`, and `4-repos.md` paths. Fixed operational method text,
  including trusted instruction paths, audit steps, tool limits, and output
  contracts, is allowed. Add no task framing, goal, or intent speculation.
- Give verification helpers neutral, falsifiable claims with file:line; omit your verdict, severity, and reasoning, but include any rule that makes a violation falsifiable.
- Assign one fresh skeptic per claim.
- Treat leakage as a critical defect: stop and report.
- Apply `principle-generator-evaluator` for review-gate fresh context, no shared history, and one-claim-one-fresh-judge separation.
