---
name: principle-fail-closed
description: "Apply when a guarantee cannot be evaluated. The answer is no: unknown counts as unsupported, a missing verdict as not passed, an inconclusive refutation as the finding standing."
user-invocable: false
---

# Fail Closed

When a guarantee cannot be evaluated, the answer is no. Unknown counts as
unsupported, a missing verdict counts as not passed, an inconclusive
refutation leaves the finding standing, and an unset variable aborts
instead of expanding to empty.

**Why:** The ambiguous state is where silent failures live. A gate that
defaults open under uncertainty is a gate only while nothing is wrong —
which is exactly when it was not needed.

**Pattern:**
- Never advance on a missing or unparseable verdict. Retry once with the
  error; on second failure, halt loudly.
- A capability check that cannot run counts as unavailable. Take the
  fallback path, never the optimistic one.
- Refutation passes are default-keep: they can remove a false positive
  and never a true one. Inconclusive means the finding stands, and
  severity is never softened on an uncertain reply.
- An ambiguous instruction about an irreversible step resolves to the
  safer reading (watch the draft rather than publish it).
- Fail closed governs guarantees. An enhancement that cannot run degrades
  loudly instead — see
  `skills/principle-optimization-never-dependency/SKILL.md`.
