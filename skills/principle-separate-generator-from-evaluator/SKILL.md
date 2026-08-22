---
name: principle-separate-generator-from-evaluator
description: A producer never grades its own output, and a reviewer reports without fixing — pointed to by code-review and verifying-ux when a verdict is cast.
user-invocable: false
---

# Separate The Generator From The Evaluator

A principle, not a gate. The generator — whoever wrote the thing — must never
evaluate its own output. This separation prevents self-evaluation bias, the
tendency to see what you intended to write rather than what you actually
wrote. It runs both directions: an evaluator reports the defect and changes
nothing, and a producer changes the artifact and casts no verdict. Collapse
the two roles and the evaluation stops being evidence of anything.

## What it rules out

- **Grading your own exam.** An author who reviews their own work reads the
  intent they already hold, and the gap between intent and text is exactly
  what a review exists to find.
- **A shared history standing in for fresh context.** An evaluator who
  watched the work happen inherits the producer's framing, so it forms no
  independent understanding of what the artifact says.
- **A reviewer who fixes what it found.** It would then approve its own fix,
  which puts both roles back in one head — this is why an evaluator holds no
  write access rather than merely being asked to refrain.
- **A producer who declares itself done.** Self-assessment is input to a
  verdict, not the verdict.
- **Asking the producer what it meant.** A question that reaches the producer
  re-imports the framing the separation removed; the ambiguity is recorded as
  an open question instead.

## Boundary

- It does not forbid a producer from testing, checking, or self-reviewing its
  own work. Those are how a producer raises quality before handing it over.
  What it forbids is the producer casting the verdict.
- It says nothing about how strict the verdict must be, or how long a veto
  holds. Each review procedure sets its own bar and its own cap.
- A surface that cannot load a second file states this rule inline rather than
  pointing at it, per `principle-every-rule-reaches-every-surface`.

## Where it applies

- `skills/code-review/SKILL.md`
- `skills/verifying-ux/SKILL.md`
