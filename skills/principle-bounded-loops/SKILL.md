---
name: principle-bounded-loops
description: 'Defines bounded loops. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Bounded Loops

Declare the bound with the loop: watch cycles, retries, poll budgets, helpers in flight, or a terminal verdict.

- Halt loudly at a count cap and report all unresolved state; never restart, extend, or soften exit criteria.
- Keep retry budgets small and stated: "retry once, then halt loudly".
- Treat a verdict as the bound; declare it and never supply a count the loop deliberately omits. The operator is the outer bound.
- Preserve Team's uncapped review verdicts: DESIGN ends on the reviewer's verdict; IMPLEMENT ends when no Blocking or Major finding remains.
- Give outputs explicit budgets: ~200-line design, ≤ 30-line helper reply, byte-capped prompt.
- Restructure over-budget output by dropping whole named units. Never silent truncation.
