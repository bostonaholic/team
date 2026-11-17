## Commit Discipline

The ship commit is only for uncommitted final changes (e.g., changelog); slice commits stay as they are.

Report the outcome (draft PR URL and commit hash). Name each screenshot failure from Upload's return ([Screenshot Upload](04-screenshot-upload.md#report)).

Next: when the PR is ready for review, run `gh pr ready` and move its ticket to in-review per the [tracking rules](tracking.md). Ready means every check on the PR head has passed. A failing check blocks it even when branch protection does not require it (codecov, for one); name the failing check instead of promoting.
