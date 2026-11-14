## Commit Discipline

When creating the ship commit, call the Skill tool with `writing-commit-messages` inline, and pass the fixed body line `Implements docs/plans/<id>/8-plan.md` with this run's plan path. The ship commit is only for uncommitted final changes (e.g., changelog); slice commits stay as they are.

Report the outcome (draft PR URL and commit hash). A non-null screenshot `operator_note` goes into the report verbatim ([Screenshot Upload](04-screenshot-upload.md#read-the-result)), never into a PR body.

Next: when the PR is ready for review, run `gh pr ready` and move its ticket to in-review per the [tracking rules](tracking.md).
