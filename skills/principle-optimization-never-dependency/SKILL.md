---
name: principle-optimization-never-dependency
description: "Apply to optional enhancements: failure must preserve the required result."
user-invocable: false
---

# Optimization, Never a Dependency

**Invariant:** Failure of an optional enhancement never changes the required
outcome.

**Rules:**
- On absence, error, or silence, perform the work inline with held tools and
  continue; do not fail solely because the enhancement failed.
- Do not soften a verdict. Report the skip and reason under
  `skills/principle-skip-loudly/SKILL.md`.
- An enhancement never blocks, retry-loops, or prompts the user.
- Discard malformed results and use the fallback; never repair and trust them.
- Classify guarantees separately; they fail closed under
  `skills/principle-fail-closed/SKILL.md`.

**Check:** Would this run reach the same required outcome if the enhancement
were unavailable?
