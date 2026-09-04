---
name: principle-mechanical-gates
description: 'Defines mechanical gates. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Mechanical Gates

Enforce required rules with deterministic checks that run regardless of model behavior; A rule enforced only by good behavior is not enforced at all.

- Push each check to the cheapest, most deterministic layer that can catch it; never use an expensive judge where regex suffices.
- Reject wrong-layer checks that are slow, flaky, or paid without need.
- Detect errors early, report loudly, and never mask them.
- Prefer preventing violations over observing them; check artifacts before intent.
- Reject checks whose pass depends on model compliance.
