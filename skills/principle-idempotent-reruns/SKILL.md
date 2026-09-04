---
name: principle-idempotent-reruns
description: 'Defines idempotent reruns. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Idempotent Re-runs

A re-run converges on the same end state instead of failing or
duplicating. Already-done is done, not an error; match before create;
re-read before write.

**Why:** Interruption is normal — a rate limit, a crash, a compaction, a
user stop. When a failure mid-plan stops the run, the recovery story is
"run it again", and that only works if the second pass is safe against
the first pass's partial results.

**Pattern:**
- Deleting the already-deleted, closing the already-closed: report it as
  done and continue. Never treat convergence as failure.
- Match by title or content before creating, so a re-run of an approved
  plan never duplicates an issue, a comment, or a construct.
- Re-read each item immediately before writing it. An item whose state
  changed since the plan is skipped and reported, not overwritten.
- Record landed steps as you go, so a re-run knows which steps remain
  rather than re-deriving them from hope.
- Run mutations serially with backoff where a rate limit could shred a
  half-applied plan.
