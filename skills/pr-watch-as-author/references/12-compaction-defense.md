### Compaction defense

After a compaction, re-derive the baseline from GitHub — unresolved-thread
ids, review-summary ids with their authors and submission times,
conversation-comment ids with their authors and timestamps, `state`,
`reviewDecision`, the head SHA, and the CI checks for that head — then
continue polling from the snapshot lines already in the transcript.

GitHub cannot return the triaged PR-level id set. Recover it from the
snapshot lines and batch reports in the transcript. When no copy
survives, fail toward re-presenting rather than toward silence: treat
the PR-level items as untriaged and triage them again, saying plainly that
some items may repeat.

GitHub cannot return the reported-failure set either. Rebuild it from the
snapshot lines and CI reports in the transcript. When no copy survives,
report the current failures again and say so.

Restore attempt counts, fix SHAs, and both grants from the fix reports and
snapshot lines in the transcript. When the counts are lost, disable CI
fixes for the rest of the arming and say so. A lost count must never allow
an extra push.

Report:

- the stop reason (approval, merge, close, user interrupt, 3-cycle soft
  cap, 3 consecutive poll failures, third-party participant, exclusion,
  push failure, `CI fix bound`, or `CI exclusion`)
- both grants: `feedback <present-then-stop|authorized>, CI <report|fix>`
- the head SHA and its failing and pending check names
- each fix commit SHA and each check's attempt count
- the number of cycles consumed
- the handoff — on approval,
  `Next: run /shipit when you want to land it.`. On the soft cap, print
  the baseline state and the resume command for the scheduled pr-watch
  job. After the user's choices run, offer to re-arm the watch.
