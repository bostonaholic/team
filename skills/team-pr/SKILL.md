---
name: team-pr
description: Open the pull request after verification passes. Updates the changelog, optionally closes the tracking beads issue, and closes out the topic. Trigger on "open the PR", "ship it", or "/team-pr".
---

# TEAM PR — Standalone Phase

Run the PR phase. Two modes:

- **Resume mode** — Implement passed the aggregate gate; the topic
  branch has slice commits ready and a `task.md` with `beadsId`
  exists in `docs/plans/`. Read the beads ID from there.
- **Standalone mode** — no matching task.md, but the working tree has
  commits or staged changes ready to ship. Treat the current branch as
  the work source.

## Input

`$ARGUMENTS` is optional. If a beads ID is supplied, use it as `beadsId`
even in standalone mode (so `bd close` runs at ship time).

## Execution

1. Derive `topic` (from current branch, `$ARGUMENTS`, or the most recent
   `docs/plans/<today>-*-task.md`).
2. **Resume path** — `docs/plans/<today>-<topic>-task.md` exists: read
   `beadsId` from its frontmatter. Proceed with the documented flow
   below.
3. **Standalone path** — no matching task.md:
   - Verify the branch has commits ahead of the default branch, or
     uncommitted changes worth shipping. If neither, report "Nothing to
     ship." and stop.
   - Skip verification gate enforcement — the user is taking
     responsibility for correctness. Warn them once.
   - Use `$ARGUMENTS` (if a beads ID) as `beadsId`; otherwise `null`.
4. **Update CHANGELOG.md** before committing (see Changelog Update below).
5. Present shipping options. In resume mode the implementer already
   committed each slice atomically during the Implement phase; in
   standalone mode the branch may have any commit shape. These options
   decide what to do with that history now:
   - **Open PR from existing commits** — push the current branch and
     open a pull request. Any uncommitted final changes (typically
     CHANGELOG.md) land as a single trailing ship commit.
   - **Keep commits locally** — leave commits on the current branch
     without opening a PR.
   - **Keep as-is** — leave final changes uncommitted; existing commits
     remain.
6. Execute user's choice.
7. **Close beads issue.** If `beadsId` is non-null and the user chose to
   commit (either option), use `/beads:close <beadsId>` to mark the issue
   as done. Skip if the user chose "keep as-is".
8. If a worktree was created in the Worktree phase, clean it up
   (cherry-pick or rebase commits onto the target branch, then let
   Claude Code remove the worktree).

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
