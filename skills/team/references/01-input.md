## Input

First read [routing](routing.md) and select the route from the leading argument
of `$ARGUMENTS`. When the leading token is exactly `investigate`, `plan`,
`prototype`, `feature`, `fix`, or `refactor`, that token is the route and the
remaining tokens are the task. Otherwise there is no route: the whole
`$ARGUMENTS` is the feature description and the unprefixed full feature workflow
runs. Never scan issue bodies, quoted text, or the description for route words.

After routing, `$ARGUMENTS` (or its remaining task tokens) may be:

- A ticket identifier (e.g. `ENG-1234`) — used as `<id>` prefix and
  recorded as `ticketId` on `1-task.md`.
- An issue URL (e.g. `https://github.com/org/repo/issues/42`) — fetched
  through `gh issue view` to extract the title and body.
- Free-form text — used directly as the feature description.

If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.
A route whose remaining task is empty requests that task before any mutation.
