---
name: principle-bounded-loops
description: "Apply when writing any loop, retry, or watch cycle. Declare the cap with the loop and make hitting it a loud, terminal, reported outcome — never silent grinding."
user-invocable: false
---

# Bounded Loops

Every loop carries a declared cap, and hitting the cap is a defined,
loud, terminal outcome: halt and hand the work back with the full
unresolved state. An unbounded veto is its own failure mode.

**Why:** A loop that cannot converge must not discover that by running
forever. The cap converts "stuck" from an invisible state into a reported
one, at a bounded and pre-agreed cost.

**Pattern:**
- Declare the bound with the loop: review rounds, watch cycles, retries,
  revisions, helpers in flight.
- At the cap, halt terminally and report everything unresolved. Never
  silently restart, extend, or soften the exit criteria to escape.
- A retry budget is small and stated ("retry once, then halt loudly").
- A check that cannot be satisfied hands the work back — it does not
  grind.

## Size budgets

The same rule bounds output. Artifacts and replies carry size targets —
a ~200-line design, a ≤ 30-line helper reply, a byte-capped prompt.
Over budget means restructure: drop whole units and name what you
dropped. Never silent truncation.
