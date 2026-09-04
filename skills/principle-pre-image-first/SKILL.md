---
name: principle-pre-image-first
description: 'Defines pre image first. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Pre-image First

Before mutation, capture the untouched baseline and a recovery anchor or pre-image; No pre-image, no destructive write.

- Run checks BEFORE the operation so later failures classify as pre-existing or introduced.
- Capture the recovery anchor before rewrites and report it on success and failure; preserve `git reset --hard <sha>` recovery where applicable.
- Cache bodies before composing replacements for rewrite, close, or overwrite operations.
- Compare the target with its pre-image at write time; skip and report drift.
- Apply `principle-idempotent-reruns` to this comparison on re-run.
- A baseline that could not run is UNKNOWN and never proves preservation.
