### 5. Edge cases

- If a wake finds zero unresolved threads, no untriaged issue comments,
  and no other change (for
  example, a reviewer resolved their own thread), re-arm silently and
  present nothing. Check the untriaged-comment set before taking this
  path: a wake caused by a new plain comment has zero unresolved threads
  by definition, so a thread-only reading of this rule would silently
  swallow exactly the feedback that woke the loop.
- If a CHANGES_REQUESTED review arrives with an empty body and no
  threads, there is no verifiable ask to triage. Emit a status line that
  names the reviewer and the requested-changes state, then treat it as a
  needs-clarification exclusion and stop the loop. Suggest that the user
  ask the reviewer what they want. Watching past it would hide a
  blocking signal.
