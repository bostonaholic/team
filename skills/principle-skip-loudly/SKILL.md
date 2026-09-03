---
name: principle-skip-loudly
description: "Apply to completion reports: name every skipped, degraded, or omitted action."
user-invocable: false
---

# Skip Loudly

**Invariant:** Reports name skipped, degraded, incomplete, and deliberately
omitted work as visibly as completed work.

**Rules:**
- Keep empty sections and state `No findings.`, `Not run: <reason>.`, or
  `Nothing declared.` as appropriate.
- For every skip, name the check, cause, and work that would have run.
- Name unchanged items, fenced omissions, partially loaded data, and remaining
  disk or board state.
- Report degradation per affected item with degraded wording such as
  `unverified`, never success wording.

**Check:** Could a reader mistake anything not run or not completed for a clean
success?
