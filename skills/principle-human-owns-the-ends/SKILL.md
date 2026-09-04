---
name: principle-human-owns-the-ends
description: 'Reserves goals and shipping decisions for the user. Apply when deciding whether autonomous work may proceed or finish.'
user-invocable: false
---

# The Human Owns the Ends

Keep two decisions human: what to build and what to ship; run everything between autonomously, with PR review as the checkpoint.

- Never pause an autonomous run to triage findings.
- Loop Blocking and Major findings through the fixer automatically.
- Put Minor-and-below findings in PR review notes; Minor is the human's queue, not a wastebasket.
- Never land on the system's own judgment; open PRs autonomously, but require a human merge decision.
- Defer questions that can wait to PR review.
- Halt blocked runs terminally and report instead of asking permission to continue.
