---
name: principle-mechanical-gates
description: 'Defines mechanical gates. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Mechanical Gates

Where a rule must hold, do not ask the model to remember it. Enforce it
with a deterministic check that runs whether or not the model cooperates.
A rule enforced only by good behavior is not enforced at all.

**Why:** Models forget instructions roughly one time in five. A prompt
line is a request; a gate is a guarantee. The deterministic layer outranks
the model: a mechanical check can fail a step that every agent in the run
believes is fine.

**Pattern:**
- Push every check to the cheapest, most deterministic layer that can
  catch it. Never an expensive judge for something a regex could decide.
- A check at the wrong layer is worse than no check: slow, flaky, or
  costing money to learn nothing.
- Detect errors early, surface them loudly, never mask them silently.
- Prefer a check that makes the violation impossible over one that
  observes it, and a check on the artifact over a check on the intent.
- A check that only passes when the model happens to be well-behaved is
  not a check.
