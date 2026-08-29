---
name: principle-pre-image-first
description: "Apply before any destructive or history-rewriting step. Capture the baseline that classifies the after-state and the pre-image or anchor that makes the change recoverable — no pre-image, no destructive write."
user-invocable: false
---

# Pre-image First

Before anything is changed, capture what was true: the baseline that
lets the after-state be classified, and the pre-image or recovery anchor
that makes the change reversible. No pre-image, no destructive write.

**Why:** A check with no baseline proves nothing after — a failure that
was already red is not a regression you caused, and without the before
you cannot tell. And a run that leaves the user unable to say
`git reset --hard <sha>` has failed even when the operation succeeded.

**Pattern:**
- Run the checks BEFORE the operation, on the untouched state, so a
  post-operation failure classifies as pre-existing or introduced.
- Capture the recovery anchor before anything is rewritten, and report it
  at every stop — success and failure alike.
- Cache the pre-image of any body you rewrite, close, or overwrite,
  before composing the replacement. A rewrite with no cached pre-image
  does not run: the only record of what the item said would be the value
  the write is about to destroy.
- Compare against the pre-image at write time; a target that drifted from
  its pre-image is skipped and reported.
- A baseline that could not run is UNKNOWN — never evidence that behavior
  was preserved.
