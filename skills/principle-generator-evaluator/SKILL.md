---
name: principle-generator-evaluator
description: 'Defines generator evaluator. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Generator–Evaluator Separation

The agent that produced the work never evaluates it; use Veto without authorship from a fresh-context judge with no shared producer history.

- Give evaluators the artifact and upstream spec, never production discussion or author narration.
- Convey intent only through artifacts written before the work existed.
- Let evaluators report defects and change nothing; let producers change work and cast no verdict.
- Require both roles to close a review cycle.
- Have evaluators flag open questions without asking the producer.
- Assign one claim to one fresh judge; never reuse a checker that judged earlier claims.
- Apply `skills/reviewing-code/SKILL.md` for code review.
