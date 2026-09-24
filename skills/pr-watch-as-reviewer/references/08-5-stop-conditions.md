### 5. Stop conditions

The loop stops on exactly one of nine conditions, each reported by name.
The [watch loop](../../pr-watch-as-author/references/watch-loop.md) owns three of them: user interrupt, the 3-cycle soft
cap, and 3 consecutive poll failures. This skill adds six:

- **Approval cast** — the gate cleared, every re-review verdict passed,
  and step 6 ran.
- **Merge or close** — the PR reached a terminal state. Report it,
  including "merged without your approval" when that is what happened.
- **Empty tracked set** — a mid-watch poll that returns an empty tracked
  set stops the loop without approving. Suggest an approval by hand, or
  a re-arm after you post new comments. When some tracked items vanish
  but others remain — of any shape — the remaining items drive the gate:
  a withdrawn or deleted item neither blocks the approval nor is
  necessary for it.
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
- **Third-party participant** — an unresolved tracked thread carries a
  comment from a third-party login (the step-4 third-party check). No
  verdict action, resolve, reaction, or rebuttal fires that cycle — nor
  does the approval.
- **Dispute stands** — a rejected verdict repeats on a thread that
  already carries the viewer's own reply below the first comment (the
  step-4 Dispute-stands check). It stops instead of rebutting. No
  verdict action, resolve, reaction, or rebuttal fires on any thread
  that cycle — nor does the approval.

When the shared soft cap fires, two reports are this skill's to add. When
the cap was reached with a review summary or plain comment still pending, say so explicitly
and name the item: this is the expected outcome for PR-level feedback the
author never engaged, not a malfunction. A rejected verdict that never
draws a second reply never reaches the Dispute-stands check, so it
rebuts once and then waits on the author: name each thread still holding
one, what the last rebuttal argued, and how the author answered it.
