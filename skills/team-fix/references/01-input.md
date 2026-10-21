## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`): set aside as `ticketId` on `1-task.md`.
- An issue URL: fetch its title and body with `gh issue view`.
- Free-form text: the bug description.

When empty, **discover, do not demand**: read recent `git log` and the repo's
`README` / `CLAUDE.md` to surface the likely failing area, then use
`AskUserQuestion` with labeled options for any genuine gap. Never bare-stop
with "describe the bug" when context is available.
