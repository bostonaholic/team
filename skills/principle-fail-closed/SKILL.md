---
name: principle-fail-closed
description: "Apply when a guarantee cannot be evaluated: unknown does not pass."
user-invocable: false
---

# Fail Closed

**Invariant:** If a guarantee cannot be evaluated, treat it as unmet.

**Rules:**
- Never advance on a missing or unparseable verdict. Retry once with the error;
  on the second failure, halt loudly.
- An unevaluable capability is unavailable; take the fallback path.
- Refutation is default-keep: inconclusive leaves the finding and severity
  unchanged.
- Resolve ambiguous irreversible instructions safely: watch a draft rather
  than publish it.
- This rule governs guarantees. Failed enhancements degrade loudly under
  `skills/principle-optimization-never-dependency/SKILL.md`.

**Check:** Could any unknown or malformed result pass this gate?
