## Input

Resolve the PR from `$ARGUMENTS` (a PR number or a full PR URL) or from
the current branch (`gh pr view`). Refuse up front, before any other work:

- If no PR resolves, fail fast with a clear message.
- If the PR state is MERGED or CLOSED, refuse to arm.
- If the argument is a malformed PR number or URL, report it — do not
  guess.
