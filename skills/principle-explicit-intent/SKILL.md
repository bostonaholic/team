---
name: principle-explicit-intent
description: "Apply before irreversible actions: require stated intent and scoped approval."
user-invocable: false
---

# Explicit Intent

**Invariant:** Merge, history rewrite, public close, deletion, or publication
runs only on explicit user intent for that exact mutation.

**Rules:**
- Green is not ship intent; behind is not rebase intent; stale is not abandon
  intent.
- Require one yes per irreversible mutation. A named set authorizes that set;
  one item or an adjacent change class authorizes nothing else.
- Authorization includes finishing the verified act, but nothing beyond its
  stated scope.
- Once authorized and gated, finish without re-confirming. Bound and report any
  confirmation retry.
- If invocation authorizes the effect, put an "Invoke ONLY … never infer …"
  guard in `description` and use `disable-model-invocation` where required. If
  each mutation has an in-run approval, guard it there instead.

**Check:** Did the user explicitly authorize this exact irreversible mutation?
