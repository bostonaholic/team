## Changelog Update

Before creating the ship commit, read [changelog rules](changelog.md) and
update `CHANGELOG.md` per that reference:

1. If the root `CHANGELOG.md` does not exist, create it from the reference's
   initial-file template only when the user explicitly requested a new
   changelog. Otherwise leave it absent, note the skip in the completion
   report, and stop this procedure.
2. Scan commits since the last changelog entry using `git log`.
3. Filter to user-facing commits: `feat:`, `fix:`, `perf:`, `security:`,
   and any `BREAKING CHANGE:` footer. Exclude `chore:`, `test:`,
   `refactor:`, `ci:`, `docs:`.
4. Translate each included commit to a plain-language user-facing bullet.
5. Add entries under `[Unreleased]` in `CHANGELOG.md`.
6. Include the `CHANGELOG.md` change in the ship commit.

If there are no user-facing commits, skip the changelog update and note
this in the completion report.
