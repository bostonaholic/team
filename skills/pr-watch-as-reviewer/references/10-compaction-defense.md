### Compaction defense

After a compaction, re-derive the live state from GitHub. Re-fetch the
viewer login and re-run the poll query. Recompute the tracked set, the
gate, and the current auto-merge state, which the poll query carries as
`autoMergeRequest`. Then continue polling. The arm-time baselines are
the values GitHub cannot return — recover them from the transcript:

- the **arm-time head SHA** — printed in the arm report and repeated in
  every snapshot line. When no copy survives, step 6's fail-closed rule
  applies.
- the **arm-time auto-merge state and if its confirmation was granted**
  — the state is in the arm report and every snapshot line. When
  unrecoverable, treat the run as having no arm-time auto-merge
  confirmation.
- the **arm-time tracked count**, per shape — printed in the arm report
  and the
  cycle-0 snapshot. When unrecoverable, say so in the approval body in
  place of the count comparison.
- the **tracked comment list** — the classification from step 1, printed
  in the arm report by url. This one is *not* re-derivable: re-running
  the classification would re-read bodies and could silently reach a
  different answer than the list the user saw and accepted. When no copy
  survives, do not reclassify and do not guess. Report that the tracked
  comment list was lost and offer to re-arm, which re-runs the
  classification and re-prints it for the user. A watch that cannot say
  what it is tracking must not approve.
- **which replies were already rebutted** — fully re-derivable, and the
  one baseline a compaction cannot damage: the viewer's own replies are
  on the thread, so the last one shows which of the author's replies has
  already been answered. Nothing is written for a reply that already
  carries a rebuttal beneath it. Prefer GitHub over the transcript when
  the two disagree, since GitHub holds what was actually posted.
- **which threads the skill resolved** versus the author — named in the
  snapshot lines. Needed for the `<R>` disclosure in the approval body.
  When unrecoverable, say so in the body in place of the count rather
  than attributing the resolves either way.
- the **re-review verdicts** — printed in the snapshot lines. Unlike the
  arm-time baselines these are re-derivable from GitHub: when no copy
  survives, re-run the step-4 re-review over every settled tracked
  item instead of trusting memory. A verdict is never assumed passed.

Report:

- the stop reason (approval cast, merged/closed
  without approval, user interrupt, cycle-48 timeout, 3 consecutive
  poll failures, the empty-tracked-set stop, or confirmation declined)
- the number of cycles consumed
- when an approval was cast: its URL, the cited head SHA, and the
  per-item verdict summary (each thread's path or each plain comment's
  url, its shape, whether it was
  addressed or answered, the reaction that verdict placed, and who
  resolved it — you or the author). When the
  head moved between arm and approval,
  both SHAs and a drift note. When a tracked count changed between arm
  and approval, both counts for that shape
- the write ledger, on every path: how many threads the skill resolved,
  how many rebuttals it posted and on which threads, and how many
  reactions it placed. These are writes on someone else's PR, so they
  are reported whether or not an approval was cast — a run that ends on
  a user interrupt still leaves them behind
- on the cycle-48 timeout: which tracked items were still gated, split
  by shape, and for a plain comment whether it was never engaged or
  engaged but judged pending. Name separately any thread left holding a
  rejected verdict, with what the last rebuttal argued and how the
  author answered, plus the by-hand follow-up options (make the argument
  yourself, take the author's position and resolve, or approve manually)
- the handoff — path-dependent. On approval there is no follow-on
  reviewer skill: landing belongs to the author, not the reviewer. On
  interrupt, timeout, or a declined confirmation, offer to re-arm the
  watch.
