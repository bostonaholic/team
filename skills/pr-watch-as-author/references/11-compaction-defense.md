### Compaction defense

Most loop state is re-fetchable from GitHub. After a compaction,
re-derive
the baseline: fetch the current unresolved-thread ids, the issue-comment
ids with their authors and timestamps, `state`, and `reviewDecision`,
then continue polling from the
snapshot lines already in the transcript.

The triaged-comment id set is the one piece GitHub cannot return, since
a triaged comment looks identical to an untriaged one. Recover it from
the snapshot lines and batch reports in the transcript. When no copy
survives, fail toward re-presenting rather than toward silence: treat
the comments as untriaged and triage them again, saying plainly that
some items may repeat. A duplicated punch-list item costs the user a
moment; a dropped one costs them the feedback.

Report:

- the stop reason (approval, merge, close, user interrupt, 3-cycle soft
  cap, or 3 consecutive poll failures)
- the active mode (present-then-stop or authorized)
- the number of cycles consumed
- the handoff — on approval,
  `Next: run /shipit when you want to land it.`. On the soft cap, print
  the baseline state and the resume command for the scheduled pr-watch
  job. After the user's choices run, offer to re-arm the watch.
