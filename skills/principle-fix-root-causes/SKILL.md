---
name: principle-fix-root-causes
description: "Apply when debugging any failure. Trace each symptom to its root cause and fix it there — reproduce first, ask why until the causal chain bottoms out, and never add a guard that silences the symptom while the disease remains."
user-invocable: false
---

# Fix Root Causes

A debugging fix lands at the root cause, never at the symptom. Trace
every failure to the cause that produced it and correct it there — a
fix applied without understanding the root cause is a coin flip.

**Why:** Symptom fixes accumulate. Each workaround makes the system
harder to reason about, and the real bug remains. A root-cause fix is
slower upfront and cheaper in total debugging time.

**Pattern:**
- Reproduce first. A bug you cannot reproduce is a fix you cannot
  verify.
- Ask "why" until the chain bottoms out at a cause you can change;
  the proximate cause ("this variable is null") is never the root
  ("this runs before initialization completes").
- Resist guards that silence crashes: a nil check is a root-cause fix
  where absence is a legal state, and a symptom fix where it is not.
- A workaround that needs a paragraph-long comment to justify it
  means the code is wrong. Fix the code, not the comment.
- Fix the pattern, not just the instance: grep for siblings of the
  root cause and fix every occurrence.
- When stuck, instrument instead of guessing: add logging, read the
  actual error, observe before hypothesizing.

## Restart bugs: suspect state before code

Code does not change between runs; state does. When something "fails
after restart," suspect stale persistent state first: config files,
caches, lock files, serialized state. If clearing a state file
restores behavior, the fix is state validation, not new code.
