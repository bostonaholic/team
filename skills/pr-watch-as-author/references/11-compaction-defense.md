### Compaction defense

After a compaction, re-derive the baseline from GitHub — unresolved-thread
ids, review-summary ids with their authors and submission times,
conversation-comment ids with their authors and timestamps, `state`, and
`reviewDecision` — then continue polling from the snapshot lines already in
the transcript.

GitHub cannot return the triaged PR-level id set. Recover it from the
snapshot lines and batch reports in the transcript. When no copy
survives, fail toward re-presenting rather than toward silence: treat
the PR-level items as untriaged and triage them again, saying plainly that
some items may repeat.

Report:

- the stop reason (approval, merge, close, user interrupt, 3-cycle soft
  cap, 3 consecutive poll failures, or third-party participant)
- the active mode (present-then-stop or authorized)
- the number of cycles consumed
- the handoff — on approval,
  `Next: run /shipit when you want to land it.`. On the soft cap, print
  the baseline state and the resume command for the scheduled pr-watch
  job. After the user's choices run, offer to re-arm the watch.
