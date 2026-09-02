---
name: principle-generator-evaluator
description: "Apply when work is judged — a review, a verdict, a verification pass. Never let the generator grade its own work; give the evaluator fresh context and veto without authorship."
user-invocable: false
---

# Generator–Evaluator Separation

The agent that produced the work never evaluates it. Judgment comes from
fresh context — no shared history with the producer — and the judge holds
veto without authorship: it blocks the line and changes nothing.

**Why:** Self-evaluation bias makes a generator see what it intended to
write rather than what it wrote. Shared history smuggles the author's
narration into the verdict. And an evaluator that can edit would fix the
defect it found, then approve its own fix — collapsing generator and
evaluator into one role. Do not let the same model grade its own exam: a
confident wrong answer is the most expensive kind.

**Pattern:**
- The evaluator starts with fresh context. It reads the artifact and the
  upstream spec, never the discussion that produced them.
- Intent reaches the evaluator through artifacts written before the work
  existed. A spec is a fixed target; an author defending finished work is
  a moving one. Isolation withholds narration, not intent.
- Veto without authorship: the evaluator reports defects and fixes
  nothing; the producer changes the work and casts no verdict. Neither
  role closes a review cycle alone.
- An evaluator needing clarification flags an open question. It never
  asks the producer.
- One claim, one fresh judge: a checker that has judged earlier claims
  accumulates a model of the review and anchors to it.

Applied wherever work is judged; `skills/reviewing-code/SKILL.md` owns the
code-review application.
