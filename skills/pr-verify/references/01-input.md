## Input

The PR comes from one of:

- **A PR number or URL** in `$ARGUMENTS`. A PR number must be digits-only;
  a malformed number or URL is reported — never guessed at.
- **The current branch's PR** — resolve it with `gh pr view` when no
  argument is given.
- **A pasted PR description.** With no `gh` context, the diff and
  build/test strategies degrade to LOW confidence or unverifiable — state
  that degradation per affected item.

A merged or closed PR is allowed: verify the merged state and say that is
what was verified.
