---
name: principle-every-rule-reaches-every-surface
description: A rule added to one way in is not added to the others by implication — pointed to by code-review, eng-design-doc-review, and authoring-designs when a thing has two entries.
user-invocable: false
---

# Every Rule Reaches Every Surface

A principle, not a gate. When a thing has more than one way in — two entry
modes, a path documented as usable on its own, a split across turns or
processes — a new rule added to one is not added to the others by
implication. Take each rule and name where it now holds. Each surface can be
correct read alone while the surfaces disagree with each other, and that
disagreement is invisible to any check that reads one surface at a time.

## What it rules out

- **A rule stated once, in the surface its author happened to be editing**,
  while a reader arriving through another one is governed by nothing.
- **Assuming a reader will find the other surface.** Reach is a property of
  the text in front of the reader, not of the repository as a whole.
- **Checking each surface in isolation and stopping there.** Per-surface
  correctness is what lets cross-surface disagreement survive review.
- **An unexplained absence.** A rule missing from a sibling surface is a
  finding; a stated reason for the absence answers it, and silence does not.
- **A self-containment claim with nothing behind it.** Where a surface claims
  to stand alone, that claim is itself a rule that has to be made true.

## Boundary

- It governs a rule's reach, not where the rule's full statement lives. One
  file may hold the rule while others carry its path — that is
  `principle-state-it-once`, and the two rules bound each other.
- A pointer satisfies this rule only where the reader can follow it. A surface
  that cannot load a second file states the rule inline instead.
- It applies only where more than one way in exists. A single-path thing has
  nothing to reconcile, and inventing surfaces to check is wasted work.

## Where it applies

- `skills/code-review/SKILL.md`
- `skills/eng-design-doc-review/SKILL.md`
- `skills/authoring-designs/SKILL.md`
