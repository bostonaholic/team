### Step 5 — Cluster by outcome, not by component

"Approval banners mean a human is needed now" is a theme. "checkpoint stuff" is not. Issues
filed weeks apart off the same incident belong together even when their titles share no
words. Then place each cluster:

- Prefer an existing grouping construct when its description already covers the cluster's
  outcome.
- Create a new one only when the outcome is genuinely absent. The test: would folding this
  cluster into the nearest existing construct muddy its description into something you could
  no longer mark true or false? If yes, new construct.
- Refuse the third path, where completed constructs become rolling buckets — a construct
  that delivered its outcome is allowed to close.

A declared dependency is evidence about placement: two linked issues usually serve one
outcome, and an edge crossing two constructs is worth re-examining the placement before the
edge. Dependencies order work *inside* a construct. They never justify one of their own.

A construct description is one or two sentences, in the present tense. It states a property
of the system that is either true or false, not a list of work. Good: *Nothing reaches the
app store without a durably committed record and a still-valid ownership claim. A failed
store action blocks the train visibly, rather than let automation stand down in silence.*
Bad: *Work related to store action dispatch, retries, and ownership.* Extending a description
holds to the same bar: the sentence stays markable.
