---
name: principle-human-owns-the-ends
description: 'Defines human owns the ends. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# The Human Owns the Ends

The human's leverage is at the edges of the pipeline, not the middle. Two
decisions stay human: what to build and what to ship. Everything between
runs autonomously, and mid-run findings are never surfaced for approval —
the PR review at the end is the checkpoint the system designates.

**Why:** A human approving mechanics mid-flight spends judgment where it
is cheap. Judgment is the scarce resource; move it to where it compounds
and automate everything else. Every consult the middle avoids is judgment
saved for the two decisions that were always the human's.

**Pattern:**
- Never pause an autonomous run to triage a finding: Blocking and Major
  work loops the fixer automatically; Minor-and-below lands in the PR
  body's review notes. Minor is not a wastebasket — it is the human's
  queue.
- Never land on the system's own judgment: merging is always a human
  decision. Opening the PR is autonomous; landing it is not.
- Ask at the ends, be autonomous in the middle: a question that can wait
  for PR review waits. A blocked run halts terminally and reports rather
  than asking permission to continue.
