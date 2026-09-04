### 3. Poll and change detection

Each poll is one Bash call that combines:

- `gh pr view --json state,reviewDecision,isDraft`
- a trimmed GraphQL `reviewThreads` query — thread ids and `isResolved`
  only. Past 100 threads it paginates with `after:` cursors (see the
  pagination pitfall in `skills/pr-open-comments/SKILL.md`)
- the latest review submission, in the same GraphQL call —
  `reviews(last: 1) { nodes { author { login } state body submittedAt } }`.
  A COMMENT-type review that carries only a body changes no other polled
  field, so `submittedAt` is the only signal that detects it. The author,
  state, and body feed the empty-body CHANGES_REQUESTED status line
  without an extra fetch.
- the issue-comment ids, authors, and timestamps — ids so a new comment
  is detected by identity rather than by a moving timestamp, and the
  author so the viewer's own comments can be filtered out

Print a one-line snapshot per poll so progress stays observable without
flooding the transcript. The snapshot carries the unresolved-thread
count and the count of untriaged issue comments, so feedback waiting in
either shape is visible. A change is any of:

- the unresolved-thread set differs from the last triaged set
- an issue-comment id appeared that is not in the triaged set, or the
  latest review `submittedAt`
  advanced (a new review body appeared)
- `state` or `reviewDecision` changed

A single transient poll failure is not a stop — retry on the next cycle.
After 3 consecutive poll failures, stop and name the error — never spin
silently. An expired `gh` token surfaces through this path. When the
error is an authentication failure, suggest `gh auth login` or
`gh auth refresh`.
