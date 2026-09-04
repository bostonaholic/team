## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — set aside as `ticketId` on
  `1-task.md`.
- An issue URL — fetched through `gh issue view` to extract title and body.
- Free-form text — treated as the bug description.

When `$ARGUMENTS` is empty, **discover, do not demand**: ground in repo
context before asking. Read recent `git log` activity and the repo's
`README` / `CLAUDE.md` to surface the likely failing area, then use
`AskUserQuestion` with labeled options to fill any genuine gap. Never
bare-stop with a plain "describe the bug" demand when context is available.
