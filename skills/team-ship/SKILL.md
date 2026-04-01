---
name: team-ship
description: Commit, create PR, and ship the implementation after verification passes. Trigger on "ship it", "create the PR", or "/team-ship".
---

# TEAM Ship — Standalone Phase

Run the SHIP phase. Requires `verification.passed` in the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `verification.passed`.
2. If not found: report "Verification not passed. Run /team-verify first." and stop.
3. **Update CHANGELOG.md** before committing (see Changelog Update below).
4. Present shipping options:
   - **Commit + PR** — branch, commit, open pull request
   - **Commit locally** — commit to current branch
   - **Keep as-is** — leave changes uncommitted
5. Execute user's choice.
6. Append `feature.shipped` event to the log.
7. Delete `~/.team/<topic>/` directory.

## Changelog Update

Before creating the ship commit, update `CHANGELOG.md` following the changelog
methodology in `skills/changelog/SKILL.md`:

1. Scan commits since the last changelog entry using `git log`.
2. Filter to user-facing commits: `feat:`, `fix:`, `perf:`, `security:`, and
   any `BREAKING CHANGE:` footer. Exclude `chore:`, `test:`, `refactor:`,
   `ci:`, and `docs:` commits.
3. Translate each included commit to a plain-language user-facing bullet.
4. Add entries under the `[Unreleased]` section in `CHANGELOG.md`. Create the
   file with the Keep a Changelog header if it does not exist.
5. Include the `CHANGELOG.md` change in the ship commit.

If there are no user-facing commits to document (all changes are internal),
skip the changelog update and note this in the completion report.

## Commit Discipline

When creating the commit, apply the git-commit methodology from
`skills/git-commit/SKILL.md`:

- Use Conventional Commits format: `feat:`, `fix:`, `refactor:`, etc.
- Subject line: 50 characters or fewer, imperative mood, no trailing period
- Body: wrapped at 72 characters, explains *why* not *what*
- One logical change per commit — the feature as a whole, not its
  implementation steps
- Reference the issue or plan in the footer if one exists

The ship commit represents the complete, user-visible feature. Write the
subject to describe what the feature does for users, not how it was built.

## Completion

Report the outcome (PR URL, commit hash, or "kept uncommitted").
