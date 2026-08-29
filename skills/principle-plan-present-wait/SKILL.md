---
name: principle-plan-present-wait
description: "Apply when mutations need user approval. Plan them to a file, present each consequential choice with one recommendation, and execute only the answered subset — nothing changes before the user answers."
user-invocable: false
---

# Plan, Present, Wait

Mutations are planned to a file, presented as questions with exactly one
recommendation each, and executed only on the user's answer. Nothing
changes before the user answers; no answer means no mutation; a partial
answer executes only the answered subset.

**Why:** Separating deciding from doing keeps the blast radius auditable:
the user judges the exact mutation, the plan on disk survives the wait,
and a later turn executes what was approved instead of what it remembers.

**Pattern:**
- Write the plan before presenting. The ask and the act are separate
  turns, and the executing turn re-reads the plan from disk.
- One consequential choice per question, each with one recommendation;
  present the exact text a mutation would create, not a summary of it.
- Execution re-validates each step against the class the user actually
  approved. An approval answers the plan's questions — it never relaxes a
  hard rule.
- An item may skip the wait only above a verified confidence bar and
  inside every hard rule; anything below the bar, or touching a
  carve-out, is presented, never auto-applied, at any confidence.
