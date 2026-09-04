## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — used as `<id>` prefix and
  recorded as `ticketId` on `1-task.md`.
- An issue URL (e.g. `https://github.com/org/repo/issues/42`) — fetched
  through `gh issue view` to extract the title and body.
- Free-form text — used directly as the feature description.

If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.
