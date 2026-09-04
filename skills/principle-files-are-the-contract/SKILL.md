---
name: principle-files-are-the-contract
description: 'Requires durable files for cross-step state. Apply when passing work between agents, phases, sessions, or reruns.'
user-invocable: false
---

# Files Are the Contract

Persist durable work and gate results in self-declaring files; pass state between steps through files, never shared chat memory.

- A step that produced no artifact did not happen; write before reporting completion.
- Pass a path, not a paraphrase; consumers read the artifact, not the producer's summary.
- Treat files as authoritative after interruption; rebuild ledgers and phase tables by scanning them.
- Revise only by explicit rule: overwrite a revised design; append and never overwrite verdict records.
- Checkpoint long procedures to append-only logs for fresh-context recovery.
- Record decisions, approvals, and pre-images in the artifact directory for later audit.
