---
name: principle-scope-fence
description: "Apply when executing a plan: change only what its approved scope authorizes."
user-invocable: false
---

# Scope Fence

**Invariant:** An approved artifact authorizes exactly its named work; anything
else is documented, not performed.

**Rules:**
- Do not add unplanned steps, slices, or features. Record missing work as a
  finding.
- Refactor adjacent code only when the plan says so; otherwise note it.
- Keep an approved fix within its anchored files and lines. Return for approval
  before it grows.
- Expand scope by updating the governing artifact and, for material changes,
  repeating its review.
- Report every expansion or omission under
  `skills/principle-skip-loudly/SKILL.md`.

**Check:** Does every changed line trace to the approved artifact or a reviewed
scope update?
