---
name: principle-explicit-intent
description: "Apply before any irreversible act — merge, force-push, close, delete, publish. Fire only on stated intent, scope one approval per irreversible mutation, and never re-ask what was granted."
user-invocable: false
---

# Explicit Intent

An irreversible act — a merge, a push over published history, a public
close, a deletion — fires only on the user's stated intent, never
inferred from state. A PR merely being green is not ship intent; a branch
merely being behind is not rebase intent; a PR merely being stale is not
abandon intent.

**Why:** No verification step can undo an irreversible act after the
fact. The invocation is the authorization, so it must be deliberate, and
its scope must match exactly what it authorizes.

**Pattern:**
- Granularity matches irreversibility: one yes per irreversible mutation.
  An approval covers exactly the items it names — a request naming a set
  covers that set, and a yes to one item never silently extends to an
  item it did not name. Approving an adjacent class of change never
  carries the irreversible one.
- The grant is scoped and complete: authorization to act is authorization
  to finish the verified act — and nothing beyond what was stated.
- Spend granted authorization; do not re-ask it. Once intent is stated
  and the gates pass, the run completes without stopping to re-confirm.
  Confirmation churn erodes the signal a real confirmation carries, so
  even the churn is bounded and reported.
- Guard the entry: a side-effecting skill states an explicit-intent guard
  in its description ("Invoke ONLY on … never infer …") and disables
  model invocation where the host honors it.
