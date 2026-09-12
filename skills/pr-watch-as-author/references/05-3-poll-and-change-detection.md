### 3. Poll and change detection

Each poll is one Bash call that combines:

- `gh pr view --json state,reviewDecision,isDraft`
- a trimmed GraphQL `reviewThreads` query — thread ids, `isResolved`,
  and each thread's comment connection at `first: 100`, selecting each
  comment's `id` and `author { login }`, matching the reviewer's
  fields. This adds no new round trip: the fields ride the same query,
  one more field per node. Past 100 threads or past 100 comments on a
  single thread, paginate with `after:` cursors (see the pagination
  pitfall in `skills/pr-open-comments/SKILL.md`). An unfetched page on
  either connection is a poll failure, never a short participant list —
  the third-party check below must never run against a truncated
  comment list.
- the latest review submission, in the same GraphQL call —
  `reviews(last: 1) { nodes { author { login } state body submittedAt } }`.
  A COMMENT-type review that carries only a body changes no other polled
  field, so `submittedAt` is the only signal that detects it. The author,
  state, and body feed the empty-body CHANGES_REQUESTED status line
  without an extra fetch.
- the issue-comment ids, authors, and timestamps — ids so a new comment
  is detected by identity rather than by a moving timestamp, and the
  author so the viewer's own comments can be filtered out

**Check for a third party on every poll**, before change detection
below: an unresolved thread carrying both a comment from the viewer and
a comment from a third-party login (`skills/pr-watch-mechanics/SKILL.md`,
`## Third-party definition`) stops the loop for that cycle — no triage
call, no reply, no resolve. This runs every cycle over the widened
selection above, whether or not a change fires below — a third party
joining a thread that was already unresolved trips no bullet in the
change list, so the check cannot wait for one. Unlike the reviewer
side, the viewer-comment half is not automatic: a thread the viewer
never replied on stays ordinary feedback even with a second reviewer
commenting on it. Report the login(s), or "comment author unavailable"
for a null author.

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
