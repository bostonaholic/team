---
name: principle-idempotent-reruns
description: "Apply to repeatable procedures: reruns must produce the same final state."
user-invocable: false
---

# Idempotent Re-runs

**Invariant:** Re-running a procedure converges on the same result without
duplication or overwriting changed state.

**Rules:**
- Treat already-completed deletion or closure as done and continue.
- Match title or content before creating issues, comments, or constructs.
- Re-read each target immediately before writing; skip and report drift.
- Record each completed mutation so a re-run executes only what remains.
- Run mutations serially with backoff where rate limits could leave a partial
  plan.

**Check:** Would repeating this procedure now create, erase, or apply anything
twice?
