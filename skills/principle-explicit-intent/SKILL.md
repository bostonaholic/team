---
name: principle-explicit-intent
description: 'Requires stated intent for irreversible actions. Apply before merge, force-push, close, delete, or publish operations.'
user-invocable: false
---

# Explicit Intent

Perform merges, pushes over published history, public closes, and deletions only on the user's stated intent, never inferred from state.

- Do not infer ship intent from green, rebase intent from behind, or abandon intent from stale.
- Require one yes per irreversible mutation; a named set authorizes that set, never unnamed items or adjacent change classes.
- Treat authorization as permission to finish the verified act, and nothing beyond it.
- Use granted authorization without re-asking; after gates pass, finish. Bound and report any confirmation churn.
- Put `"Invoke ONLY on … never infer …"` in descriptions of skills whose invocation authorizes side effects; set `disable-model-invocation` for stricter host-enforced entry guards.
- Put the guard at each in-run approval instead when invocation alone authorizes no mutation.
