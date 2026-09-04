## Input

`$ARGUMENTS` carries an optional board reference and an optional mode flag:

- A project number (`5`), or a full project URL
  (`https://github.com/users/<owner>/projects/5`).
- Neither — discover the visible projects with `gh project list --owner "@me" --format json`.
  Exactly one means use it. More than one means stop and list them rather than guessing which
  board to groom.
- `--promote <issue-number>` — selects promotion mode.

This section is the only place `$ARGUMENTS` is read. A malformed, non-numeric, or
unresolvable project reference stops before any read: report what was passed, name the
discovery command, and do not guess. One board per run — never groom two. A `--promote` value
that is missing, non-numeric, or repeated also stops before any read. An issue number that is
not on the board stops non-zero and does not guess, the way
`.claude/scripts/project-item-id.sh` does.

The board reference resolves `$PROJECT` and `$OWNER`, the project's owner. The repository is
never passed. Derive it from the loaded board. Each board item carries its repository URL
(`jq -r '[.items[].content.repository // empty] | unique'`). Take `$REPO` from that URL's
last segment. Scope every repository call below to `"$OWNER/$REPO"`.
**One repository per board-mode run.** A board whose items span more than one repository, or
whose repository owner differs from the project's, stops before the issue load. It names what
it found and asks which to groom. A milestone lives on one repository, and a cross-repo plan
would place work without warning against the wrong one. Promotion mode is not a board-mode
run: it names one issue, creates no grouping construct, and takes its repository from the
issue itself.

**`--promote` present → promotion mode**, whatever else was passed. A positional board
reference then only scopes which board the issue must be on. Promotion mode skips the whole
board pass, so steps 1–11 do not run. It does the narrow load in `## The promotion standard`
instead. A one-card action thus pays for neither three bulk queries nor the board-level
questions the user did not ask. **`--promote` absent → board mode**, which runs steps 1–11
below.
