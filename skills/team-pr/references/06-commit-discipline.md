Before invocation or continuation, read [skill dispatch](../team/references/skill-dispatch.md); apply its installation-aware continuation and self-resume rules.

## Commit Discipline

When creating the commit, read [commit discipline](commit.md) and apply it:

- Conventional Commits format: `feat:`, `fix:`, `refactor:`, etc.
- Subject ≤ 50 chars, imperative, no trailing period
- Body wrapped at 72, explains *why*, not *what*
- One logical change per commit — the feature, not its steps
- Reference the issue or design path in the footer if present

The implementer already committed each slice atomically during Implement.
The PR may contain multiple commits (one per slice). The ship commit is
only used if there are uncommitted final changes (e.g., changelog).

Report the outcome (draft PR URL and commit hash). When the screenshot
upload returned a non-null `operator_note`, the report carries that note
verbatim (see Screenshot Upload, "Read the result"). It is operator-facing
only and never enters a PR body.

Next: say "the PR is ready for review" (or explicitly request pr-watch-as-author through the continuation choices with
that wording) to arm the watch.
