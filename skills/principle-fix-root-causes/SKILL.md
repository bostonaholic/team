---
name: principle-fix-root-causes
description: 'Defines fix root causes. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Fix Root Causes

Land debugging fixes at the root cause, never at the symptom.

- Reproduce before fixing; an unreproduced bug cannot be verified.
- Ask why until reaching a changeable cause beyond the proximate symptom.
- Add nil guards only when absence is legal; otherwise correct why absence occurred.
- Replace paragraph-justified workarounds with a code fix.
- Grep for sibling instances of the root cause and fix every occurrence.
- When stuck, instrument, read the actual error, and observe before hypothesizing.
- For failures after restart, suspect stale persistent state first: config files, caches, lock files, serialized state.
- If clearing a state file restores behavior, add state validation instead of unrelated code.
