---
name: principle-skip-loudly
description: 'Defines skip loudly. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Skip Loudly

Whatever did not happen is reported as visibly as what did. A skipped
pass, a degraded mode, and a deliberate omission each get a named line;
a report that drops them reads exactly like a clean run.

**Why:** A sweep that skipped something and did not say so is
indistinguishable from one that had nothing to do. A reader of a report
that dropped a section cannot tell a pass that ran and found nothing from
one that never ran at all.

**Pattern:**
- A section with nothing to report says so on its own line: "No
  findings.", "Not run: <reason>.", "Nothing declared." Never drop the
  section.
- Name the reason with the skip — which check, what was unavailable, what
  would have run.
- Report what you did NOT change: deliberate omissions, items skipped by
  a fence, data loaded only in part. Anything left on disk or on the
  board is named.
- A degradation is stated per affected item, in degraded words
  ("unverified", "captured — not yet uploaded"), never wrapped in the
  success wording.
