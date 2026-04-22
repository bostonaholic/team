---
name: team-pr
description: Open the pull request after verification passes. Updates the changelog, optionally closes the tracking beads issue, and emits the terminal feature.shipped event. Trigger on "open the PR", "ship it", or "/team-pr".
---

# TEAM PR — Standalone Phase

Run the PR phase. Requires `verification.passed` in the event log.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `verification.passed`.
2. If not found: report "Verification not passed. Run /team-implement first." and stop.
3. **Extract beads ID** from the first event in the log (`feature.requested` or
   `bug.reported`). Check `data.beadsId`. If present, this pipeline is tracking
   a beads issue.
4. **Update CHANGELOG.md** before committing (see Changelog Update below).
5. Present shipping options. The implementer already committed each slice
   atomically during the Implement phase; the PR branch contains one commit
   per slice. These options decide what to do with that history now:
   - **Open PR from slice commits** — push the existing slice commits and
     open a pull request. Any uncommitted final changes (typically
     CHANGELOG.md) land as a single trailing ship commit.
   - **Keep slice commits locally** — leave commits on the current branch
     without opening a PR.
   - **Keep as-is** — leave the final changes uncommitted; slice commits
     already made during Implement remain.
6. Execute user's choice.
7. **Close beads issue.** If `beadsId` was found in step 3 and the user chose
   to commit (either option), use `/beads:close <beadsId>` to mark the issue
   as done. Skip this if the user chose "keep as-is".
8. Append `feature.shipped` event to the log.
9. Delete `~/.team/<topic>/` directory.
10. If a worktree was created in WORKTREE phase, clean it up.

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

The PR commit represents the complete, user-visible feature. Write the
subject to describe what the feature does for users, not how it was built.

Note: implementer already committed each slice atomically during the
Implement phase. The PR may contain multiple commits (one per slice). The
ship commit is only used if there are uncommitted final changes (e.g.,
changelog updates).

## Completion

Report the outcome (PR URL, commit hash, or "kept uncommitted").
