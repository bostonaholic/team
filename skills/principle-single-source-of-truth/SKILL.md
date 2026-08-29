---
name: principle-single-source-of-truth
description: "Apply when a rule, constant, or schema could live in two places. Define it in exactly one, name that owner, and make every other surface consult it rather than restate it."
user-invocable: false
---

# Single Source of Truth

Every rule, constant, and schema is defined in exactly one place, and
every other surface consults it rather than restating it. Where a copy
must exist, one side is canon and a deterministic check pins the other
to it.

**Why:** The second copy is the one that drifts. Two authorities that
disagree are worse than none, because each reader picks one and both
believe they followed the rule.

**Pattern:**
- Name the owner at the point of deference: "the schema is canonical in
  <path> — consult that skill rather than restating it."
- Constants live where they execute (the script, the table, the skill
  that runs them), and prose points at them instead of repeating values.
- A deliberate duplication — a template block, a byte-identical fragment
  — gets a consistency gate so the copies cannot drift, and a comment
  naming the canon.
- When a summary and its source disagree, the source wins. State which
  surface is authoritative where both exist.
- Restate at most one line inline for readability; anything longer than a
  line belongs to the owner, cited.
