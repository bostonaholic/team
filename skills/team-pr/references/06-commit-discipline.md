## Commit Discipline

When creating the commit, call the Skill tool with `git-commit` and apply it:

- Conventional Commits format: `feat:`, `fix:`, `refactor:`, etc.
- Subject ≤ 50 chars, imperative, no trailing period
- Body wrapped at 72, explains *why*, not *what*
- One logical change per commit — the feature, not its steps
- Reference the issue or design path in the footer if present

The implementer already committed each slice atomically during Implement.
The PR may contain multiple commits (one per slice). The ship commit is
only used if there are uncommitted final changes (e.g., changelog).

Report the outcome (draft PR URL and commit hash). When the screenshot
upload was skipped for lack of an authenticated session, the report also
carries the one-time sign-in instruction (see Screenshot Upload step 2).

Next: say "the PR is ready for review" (or run /pr-watch-as-author with
that wording) to arm the watch.
