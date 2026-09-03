---
name: principle-generator-evaluator
description: "Apply when work is judged: separate its producer from its evaluator."
user-invocable: false
---

# Generator–Evaluator Separation

**Invariant:** A producer never evaluates its own work; a fresh evaluator may
veto but never edit.

**Rules:**
- Give the evaluator fresh context containing the artifact and upstream spec,
  never the production discussion or author's defense.
- Intent comes from artifacts written before the work.
- The evaluator reports defects and changes nothing. The producer changes the
  work and casts no verdict; neither closes the cycle alone.
- An evaluator flags open questions instead of asking the producer.
- Use one fresh judge per claim. `skills/reviewing-code/SKILL.md` owns the
  code-review application.

**Check:** Did any context, capability, or role let the producer influence its
own verdict?
