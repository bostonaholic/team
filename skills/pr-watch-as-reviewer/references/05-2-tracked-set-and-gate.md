### 2. Tracked set and gate

Per poll, fetch all review threads and all plain PR comments through the
step-4 poll query. Its
selection set carries every field this partition reads. Partition them
client-side into two classes:

- A **tracked thread** is every review thread, resolved or not, that
  meets two conditions. Its first comment's author login equals the
  viewer's login, AND its first comment belongs to a SUBMITTED review.
  The first comment's author defines a user-opened thread (a reply does
  not).
- A **tracked comment** is every plain PR comment whose author login
  equals the viewer's login AND which the step-1 classification marked
  as feedback. Membership is keyed by comment id, so it survives an
  edit: editing a comment's body does not re-open the classification.
- The **tracked set** is the union of the two. Counts are always
  reported per shape, never merged into one number that hides which
  kind of evidence the approval rests on.
- Threads from the viewer's PENDING (unsubmitted) review stay excluded
  until the review is submitted. The author cannot see or resolve them,
  so a count of them would deadlock the watch until the soft cap. A pending
  review's threads join the gate only when the review is submitted.
  Plain comments have no unsubmitted state — posting one publishes it —
  so this exclusion never applies to them. (GitHub's PENDING review
  state is unrelated to the **pending** re-review verdict in step 4; the
  first means "not yet submitted", the second means "not yet settled".)
- The **gate** is every tracked thread with `isResolved: false`, plus
  every tracked comment the head has **not** advanced past (step 4
  defines the precondition). A thread leaves the gate when the author
  resolves it. A comment leaves the gate when a push lands after it.
  Neither leaving the gate is by itself an approval — the verdict
  against the current branch decides that, and a tracked comment that
  left the gate can still sit at **pending** indefinitely if the push
  did not address it.
- Recompute the tracked set and the gate on every poll. Threads you
  submit mid-watch join the gate; a plain comment you post mid-watch
  joins it only after you re-arm, because classification runs once at
  arm and a mid-watch body read is outside the exclusion. Say so when a
  new viewer comment appears mid-watch: name it, state that it is not
  tracked, and offer the re-arm. The recompute picks up a single
  thread that flips resolved↔unresolved between polls.
- **Approval condition: the tracked set is non-empty, the gate is
  empty, AND every tracked item — thread or comment — holds a current
  re-review verdict of
  addressed or answered** (per-cycle verdicts in step 4, pre-cast sweep
  in step 6). A **pending** verdict blocks the approval and does not
  stop the loop. An outdated-but-unresolved thread still blocks —
  settlement state is the only wait gate, which is why the poll query
  fetches no outdatedness field at all.
- **The verdict, never `isResolved`, is what the approval reads.** The
  skill resolves threads itself, so a gate keyed on the resolved bit
  would be a gate the skill could clear at will. Keyed on the verdict it
  cannot: a verdict exists only after the step-4 re-review read the
  branch, and the resolve is downstream of it. Two consequences to hold
  onto. A thread resolved by the skill and a thread resolved by the
  author are worth exactly the same at approval time — both need a
  passing verdict, and neither is credited for the resolve itself. And a
  thread the skill resolved on a verdict that a later push voids
  (step 6's re-check) is back to needing a fresh verdict even though its
  resolved bit never moved, which is why the pre-cast sweep re-reads
  verdicts rather than counting closed threads.
- The approval condition is never evaluated on a partial list:
  compute the tracked set and the gate only after pagination completes
  for **both** connections (`hasNextPage` is false for the threads and
  for the comments). A page of either that cannot be fetched makes
  the whole cycle a poll failure, never an empty gate.
