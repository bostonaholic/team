---
name: principle-files-are-the-contract
description: "Apply when passing state: persist the complete contract in a file."
user-invocable: false
---

# Files Are the Contract

**Invariant:** Durable files, not conversation memory, carry state between
steps, agents, sessions, and runs.

**Rules:**
- Write the declared artifact, including gate status, before reporting a step
  complete. No artifact means the step did not happen.
- Pass the path; consumers read the artifact, not a producer's summary.
- Rebuild ledgers and phase state by scanning artifacts after interruption.
- Follow explicit revision rules: overwrite a revised design; append verdict
  records and long-procedure checkpoints without overwriting them.
- Record decisions, approvals, and pre-images in the artifact directory.

**Check:** Could a fresh session recover the authoritative state from files
alone?
