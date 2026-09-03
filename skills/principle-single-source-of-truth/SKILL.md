---
name: principle-single-source-of-truth
description: "Apply to shared rules and schemas: define one owner and reference it elsewhere."
user-invocable: false
---

# Single Source of Truth

**Invariant:** Define each rule, constant, or schema in one named owner; every
other location consults it.

**Rules:**
- Name the canonical path wherever another location defers to it.
- Keep constants where they execute; prose points to them instead of copying
  values.
- If duplication is required, name the canon and enforce byte identity with a
  deterministic check.
- When a summary disagrees with its named source, the source wins.
- Restate at most one line for readability; cite the owner for more.

**Check:** Could two editable locations independently change this contract?
