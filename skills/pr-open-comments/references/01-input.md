## Input

`$ARGUMENTS` is one of:

- A PR number (`123`) — the current repo is assumed.
- A full PR URL (`https://github.com/owner/repo/pull/123`).
- Nothing — default to the PR for the current branch.

If no PR resolves from the current branch or the argument, fail fast with a
clear message and stop. If the argument is a malformed PR number or URL,
report it — do not guess.
