## Changelog Update

Before creating the ship commit, call the Skill tool with `changelog` and
update `CHANGELOG.md` per that skill:

1. Scan commits since the last changelog entry using `git log`.
2. Filter to user-facing commits: `feat:`, `fix:`, `perf:`, `security:`,
   and any `BREAKING CHANGE:` footer. Exclude `chore:`, `test:`,
   `refactor:`, `ci:`, `docs:`.
3. Translate each included commit to a plain-language user-facing bullet.
4. Add entries under `[Unreleased]` in `CHANGELOG.md`. Create the file
   with the Keep a Changelog header if it does not exist.
5. Include the `CHANGELOG.md` change in the ship commit.

If there are no user-facing commits, skip the changelog update and note
this in the completion report.
