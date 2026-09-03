---
name: principle-fix-root-causes
description: "Apply when debugging: reproduce the failure and correct its earliest changeable cause."
user-invocable: false
---

# Fix Root Causes

**Invariant:** Reproduce a failure, identify its changeable root cause, and fix
that cause rather than suppressing its symptom.

**Rules:**
- Reproduce before changing code; otherwise the fix cannot be verified.
- Follow the causal chain past the proximate failure until it reaches a cause
  you can change.
- Add a guard only when the guarded state is legal. Do not hide illegal states
  with guards or explanatory workarounds.
- Instrument and inspect the actual error before guessing.
- Search for sibling occurrences of the same root cause and fix each one.
- For restart-only failures, inspect persistent config, caches, locks, and
  serialized state first. If clearing state restores behavior, add state
  validation rather than unrelated code.

**Check:** Does the reproduction now pass because the producing cause changed?
