---
name: principle-human-owns-the-ends
description: "Apply to autonomous runs: humans choose the requested outcome and final release."
user-invocable: false
---

# The Human Owns the Ends

**Invariant:** The human decides what to build and what to ship; the pipeline
runs autonomously between those decisions.

**Rules:**
- Never pause for finding triage. Blocking and Major findings loop to the
  fixer; Minor and lower findings go to PR review notes.
- Opening a PR is autonomous. Merging always requires human ship intent.
- Defer questions that can wait to PR review.
- A blocked run halts terminally and reports instead of asking permission to
  continue.

**Check:** Is this consultation about build or ship intent, rather than a
decision the autonomous middle owns?
