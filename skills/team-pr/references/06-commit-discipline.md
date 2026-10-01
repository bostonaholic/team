## Commit Discipline

When creating the commit, read [commit discipline](commit.md) and apply it:

- Subject ≤ 50 chars, imperative, no trailing period
- Reference the issue or design path in the footer if present

The PR may contain multiple commits (one per slice). The ship commit is
only used if there are uncommitted final changes (e.g., changelog).

Report the outcome (draft PR URL and commit hash). When the screenshot
upload returned a non-null `operator_note`, the report carries that note
verbatim (see Screenshot Upload, "Read the result"); it never enters a PR
body.

Next: when the PR is ready for review, run `gh pr ready` and move its
ticket to in-review per the [tracking rules](tracking.md).
