---
name: principle-rule-of-three
description: Tolerate duplication the second time and extract on the third — pointed to by engineering-standards and refactoring-to-patterns when an abstraction is proposed.
user-invocable: false
---

# Extract On The Third

A principle, not a gate. Every abstraction carries an ongoing cost:
maintenance, runtime, false-positive triage, cognitive load. That cost is paid
by evidence, not by anticipation, and two instances are not evidence — they may
diverge tomorrow, and an abstraction built over them has guessed at the axis
of variation. Tolerate the duplication the second time. Extract on the third,
when what varies is finally visible.

## What it rules out

- **Extracting on the second occurrence**, before the axis of variation is
  known, which is a guess wearing the shape of a decision.
- **Premature DRY that couples behaviors needing to evolve independently.**
  A shared helper growing one boolean flag per caller is the symptom.
- **A parameterized abstraction with a single caller**, written for the callers
  someone expects later.
- **Counting textual similarity instead of behavioral sameness.** Two blocks
  that read alike but change for different reasons were never duplication.

## Boundary

- Three is the threshold for *extracting*, not a licence to duplicate up to
  it. Copy-paste of code already known to be one behavior is duplication at
  the first instance, and the count does not excuse it.
- It governs abstraction born of duplication. An abstraction that exists to
  name a domain concept or to open a test seam is justified by that, not by a
  count — `solid-principles` owns those readings.
- The trade runs in reverse too: an indirection left with one caller has
  stopped earning its cost and is a candidate to inline.

## Where it applies

- `skills/engineering-standards/SKILL.md`
- `skills/refactoring-to-patterns/SKILL.md`
