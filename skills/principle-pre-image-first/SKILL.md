---
name: principle-pre-image-first
description: "Apply before destructive or history-rewriting actions: capture a recoverable pre-image."
user-invocable: false
---

# Pre-image First

**Invariant:** Capture the check baseline and recoverable pre-image before any
destructive or history-rewriting operation; without them, do not write.

**Rules:**
- Run checks on untouched state so later failures classify as pre-existing or
  introduced.
- Capture the recovery anchor before rewriting and report it at every success
  or failure stop.
- Cache any body before composing its replacement, closing, or overwriting it.
- Compare the target with its pre-image at write time; skip and report drift.
  Re-run handling is owned by
  `skills/principle-idempotent-reruns/SKILL.md`.
- A baseline that did not run is UNKNOWN, never evidence of preservation.

**Check:** Could this operation run without both a usable baseline and recovery
pre-image?
