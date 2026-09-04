---
name: principle-idempotent-reruns
description: 'Requires reruns to converge without duplicate effects. Apply to interruptible or repeatable procedures.'
user-invocable: false
---

# Idempotent Re-runs

Make re-runs converge without failure or duplication: Already-done is done, not an error; match before create; re-read before write.

- Report already-deleted or already-closed targets as done and continue.
- Match title or content before creating issues, comments, or constructs.
- Re-read each item immediately before writing it; skip and report state drift instead of overwriting it.
- Record landed steps during execution so re-runs know what remains.
- Run mutations serially with backoff where rate limits could leave a plan partly applied.
