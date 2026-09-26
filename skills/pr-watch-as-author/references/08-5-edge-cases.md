### 5. Edge cases

- If a wake finds zero unresolved threads, no untriaged review summaries or
  conversation comments, and no other change (for example, a reviewer
  resolved their own thread), re-arm silently and present nothing. Check
  the untriaged PR-level item set before taking this path.
- If a CHANGES_REQUESTED review arrives with an empty body and no
  threads, emit a status line that names the reviewer and the
  requested-changes state, then treat it as a needs-clarification
  exclusion and stop the loop. Suggest that the user ask the reviewer when
  the ask itself is unclear. Otherwise, present the choice to the user
  when the user owns it.
