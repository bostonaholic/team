---
name: principle-blind-the-investigator
description: "Apply when dispatching investigators: provide the question, not the desired answer."
user-invocable: false
---

# Blind the Investigator

**Invariant:** Give an investigator the question and necessary subject
context, never the wanted answer or task framing.

**Rules:**
- Research consumes neutral questions, never task framing. Missing context
  becomes an open question, not guessed intent.
- A scout receives verbatim question text and stated context only: no added
  framing, goal, or speculation.
- A verifier receives a neutral, falsifiable claim with its governing rule and
  `file:line`, never your verdict, severity, or reasoning.
- Use one fresh skeptic per claim. Review-gate freshness is owned by
  `skills/principle-generator-evaluator/SKILL.md`.
- Treat leaked framing or conclusions as a critical defect: stop and report.

**Check:** Could the investigator infer the answer you want from its prompt?
