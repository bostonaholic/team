---
name: principle-bounded-loops
description: "Apply when writing any loop, retry, or watch cycle. Declare the cap with the loop and make hitting it a loud, terminal, reported outcome — never silent grinding. Size budgets are the output-side instance."
user-invocable: false
---

# Bounded Loops

Every loop carries a declared cap, and hitting the cap is a defined,
loud, terminal outcome: halt and hand the work back with the full
unresolved state. A loop with no declared end is its own failure mode.

**Why:** A loop that cannot converge must not discover that by running
forever. The cap converts "stuck" from an invisible state into a reported
one, at a bounded and pre-agreed cost.

**Pattern:**
- Declare the bound with the loop: watch cycles, retries, poll budgets,
  helpers in flight.
- Hitting the cap halts terminally: report everything unresolved. Never
  silently restart, extend, or soften the exit criteria to escape.
- A retry budget is small and stated ("retry once, then halt loudly").
- A loop that ends on a verdict rather than a count still declares its
  terminal condition, and the operator who can stop the run is its outer
  bound.

## Size budgets

The same rule bounds output. Artifacts and replies carry size targets —
a ~200-line design, a ≤ 30-line helper reply, a byte-capped prompt.
Over budget means restructure: drop whole units and name what you
dropped. Never silent truncation.
