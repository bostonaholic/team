---
name: principle-plan-present-wait
description: "Apply when mutations need user approval. Write the plan down, present each consequential choice with one recommendation, and execute only the answered subset — a mutation executes on the user's answer, or on an item clearing the verified-confidence carve-out."
user-invocable: false
---

# Plan, Present, Wait

Mutations are planned in writing, presented as questions with exactly one
recommendation each. A mutation executes on the user's answer, or on an
item that clears the verified-confidence carve-out while staying inside
every hard rule. Nothing changes before the user answers, and no answer
means no mutation, outside that carve-out; a partial answer executes only
the answered subset.

**Why:** Separating deciding from doing keeps the blast radius auditable:
the user judges the exact mutation, the written plan survives the wait,
and a later turn executes what was approved instead of what it remembers.

**Pattern:**
- Write the plan before presenting. The ask and the act are separate
  turns. When the approval may outlive the turn or survive compaction,
  the plan goes to a durable file, and the executing turn re-reads it
  rather than remembers it; an in-conversation list is the degenerate
  form for a same-session punch list.
- Presentation granularity matches irreversibility. An irreversible
  mutation is presented as the exact text it would create — one
  consequential choice per question, each with one recommendation. A
  reversible class whose undo is stated may be approved as a class, each
  item named with its target and evidence.
- Execution re-validates each step against the class the user actually
  approved. An approval answers the plan's questions — it never relaxes a
  hard rule.
- The verified-confidence carve-out: an item may skip the wait only
  above a verified confidence bar and inside every hard rule; anything
  below the bar, or touching a carve-out, is presented, never
  auto-applied, at any confidence.
