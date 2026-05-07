---
name: team-pr
description: Open the pull request after verification passes. Updates the changelog, optionally surfaces the tracking ticket, and closes out the topic. Trigger on "open the PR", "ship it", or "/team-pr".
argument-hint: "docs/plans/<id>/"
---

# TEAM PR — Create the Pull Request

Run the PR phase. Two modes:

- **Resume mode** — Implement passed the aggregate gate; the topic
  branch has slice commits ready. `$ARGUMENTS/task.md` and
  `$ARGUMENTS/design.md` exist.
- **Standalone mode** — no matching artifact directory, but the working
  tree has commits or staged changes ready to ship. Treat the current
  branch as the work source.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`.

The PR description is grounded in `$ARGUMENTS/design.md`. The ticket
identifier (if any) is read from `$ARGUMENTS/task.md`'s frontmatter.

## Execution

1. **Detect the base branch:**
   ```
   git symbolic-ref refs/remotes/origin/HEAD | sed 's@^refs/remotes/origin/@@'
   ```
   Falls back to `main`.
2. **Resume path** — `$ARGUMENTS/task.md` exists: read `ticketId` from
   its frontmatter. Read `$ARGUMENTS/design.md` for the "why" behind the
   changes.
3. **Standalone path** — no matching artifact directory:
   - Verify the branch has commits ahead of the base, or uncommitted
     changes worth shipping. If neither, report "Nothing to ship." and
     stop.
   - Skip aggregate-gate enforcement. Warn the user once that they are
     taking responsibility for correctness.
4. **Update CHANGELOG.md** before committing (see Changelog Update below).
5. Present shipping options via `AskUserQuestion`. Use a single question
   with a `Ship` header and these options:
   - **Open PR (Recommended)** — push the branch and open a PR. Any
     uncommitted final changes (typically `CHANGELOG.md`) land as a
     single trailing ship commit.
   - **Keep commits locally** — leave commits on the branch without
     opening a PR.
   - **Keep as-is** — leave final changes uncommitted.
6. Execute the user's choice.
7. **Tracking ticket.** If `ticketId` is non-null, surface it in the
   completion report so the user can close it in their tracking system.
   The orchestrator does not close tickets automatically.
8. **Worktree cleanup.** If a worktree was created in the Worktree
   phase, cherry-pick or rebase commits onto the target branch, then
   let Claude Code remove the worktree.

## PR Body Template

```
## Summary
[2-3 bullets drawn from $ARGUMENTS/design.md — what and why]

## Design Decisions
[Key decisions reviewers should understand]

## Changes
[Brief description, organized by component]

## How to Verify
- [ ] [Automated verification command]
- [ ] [Manual verification step]

## References
- Design: $ARGUMENTS/design.md
- Plan:   $ARGUMENTS/plan.md
```

## Changelog Update

Before creating the ship commit, update `CHANGELOG.md` per
`skills/changelog/SKILL.md`:

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

## Commit Discipline

When creating the commit, apply `skills/git-commit/SKILL.md`:

- Conventional Commits format: `feat:`, `fix:`, `refactor:`, etc.
- Subject ≤ 50 chars, imperative, no trailing period
- Body wrapped at 72, explains *why*, not *what*
- One logical change per commit — the feature, not its steps
- Reference the issue or design path in the footer if present

The implementer already committed each slice atomically during Implement.
The PR may contain multiple commits (one per slice). The ship commit is
only used if there are uncommitted final changes (e.g., changelog).

## Completion

Report the outcome (PR URL, commit hash, or "kept uncommitted").
