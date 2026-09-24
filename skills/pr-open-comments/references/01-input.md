## Input

`$ARGUMENTS` is a PR number (`123`, current repo assumed), a full PR URL
(`https://github.com/owner/repo/pull/123`), or nothing — default to the PR for
the current branch.

If no PR resolves from the current branch or the argument, fail fast with a
clear message and stop. If the argument is a malformed PR number or URL,
report it — do not guess.
