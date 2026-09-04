### 5. Stop conditions

The loop stops on exactly one of seven conditions, each reported by name.
`pr-watch-mechanics` owns three of them: user interrupt, the 3-cycle soft
cap, and 3 consecutive poll failures. This skill adds four:

- **Approval cast** — the gate cleared, every re-review verdict passed,
  and step 6 ran.
- **Merge or close** — the PR reached a terminal state. Report it,
  including "merged without your approval" when that is what happened.
- **Empty tracked set** — a mid-watch poll that returns an empty tracked
  set stops the loop without approving. This happens when you deleted
  your own last comment, or GitHub stopped returning the threads or the
  comments. The
  arm-time precondition no longer holds, so nothing gates the approval
  now. Suggest an approval by hand, or a re-arm after you post new
  comments. When some tracked items vanish but others remain — of either
  shape — the
  remaining items drive the gate. A withdrawn comment neither blocks
  the approval nor is necessary for it. A tracked comment that vanishes
  because it was deleted leaves the set the same way a deleted thread
  does.
- **Confirmation declined** — a "no", or no answer, stops the run
  without approving. This covers the immediate path's confirmation and
  any pre-cast confirmation in step 6. Step 6 has two no-cast outcomes
  that decline nothing: the confirmation-churn cap and the immediate
  path's reopened gate. Both also stop here. Report which confirmation
  was declined, and that an approval by hand remains available. For the
  churn and reopened-gate cases, nothing was declined, so report what
  happened instead. Never cast anyway, and never downgrade the decline
  into a skip without warning. (A "no" to the loop-path confirmation at
  arm is a refusal to arm, not a stop — that loop never started.)

When the shared soft cap fires, two reports are this skill's to add. When
the cap was reached with a plain comment still pending, say so explicitly
and name the comment: this is the expected outcome for a comment the
author never engaged, not a malfunction, and the reader should not have
to infer that from a bare handoff. The cap is also where an unsettled
disagreement lands, since a rejected verdict rebuts rather than stops:
name each thread still holding one, what the last rebuttal argued, and
how the author answered it. That is the case most worth a human read —
the argument is on the record and open, and deciding it is yours.
