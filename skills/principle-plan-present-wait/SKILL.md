---
name: principle-plan-present-wait
description: "Apply when mutations need user approval. Write the plan down, present each consequential choice with one recommendation, and execute only the answered subset — nothing changes before the user answers."
user-invocable: false
---

# Plan, Present, Wait

Mutations are planned in writing, presented as questions with exactly one
recommendation each, and executed only on the user's answer. Nothing
changes before the user answers; no answer means no mutation; a partial
answer executes only the answered subset — with one stated exception: an
item above the verified confidence bar of the final bullet below, and
inside every hard rule, may execute without the wait.

**Why:** Separating deciding from doing keeps the blast radius auditable:
the user judges the exact mutation, the written plan survives the wait,
and a later turn executes what was approved instead of what it remembers.

**Pattern:**
- Write the plan before presenting. The ask and the act are separate
  turns. When the approval may outlive the turn or survive compaction,
  the plan goes to a durable file, and the executing turn re-reads it
  rather than remembers it; an in-conversation list is the degenerate
  form for a same-session punch list.
- One consequential choice per question, each with one recommendation;
  present the exact text a mutation would create, not a summary of it.
- Execution re-validates each step against the class the user actually
  approved. An approval answers the plan's questions — it never relaxes a
  hard rule.
- An item may skip the wait only above a verified confidence bar and
  inside every hard rule; anything below the bar, or touching a
  carve-out, is presented, never auto-applied, at any confidence.
