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

1. **Detect mode and inventory worktrees with commits.**
   - Read `$ARGUMENTS/repos.md` if present. When present, you are in
     **multi-repo mode** — read the `## Worktrees` section to get each
     repo's worktree path.
   - For each involved worktree (single-repo: just the current one;
     multi-repo: every repo's worktree from `repos.md`), check whether
     it has commits ahead of its base branch. Skip any with no commits.
2. **Detect the base branch (per repo):**
   ```
   git -C <worktree-path> symbolic-ref refs/remotes/origin/HEAD \
     | sed 's@^refs/remotes/origin/@@'
   ```
   Falls back to `main` per repo.
3. **Resume path** — `$ARGUMENTS/task.md` exists: read `ticketId` from
   its frontmatter. Read `$ARGUMENTS/design.md` for the "why" behind the
   changes.
4. **Standalone path** — no matching artifact directory:
   - Verify the branch has commits ahead of the base, or uncommitted
     changes worth shipping. If neither, report "Nothing to ship." and
     stop. (Standalone mode is single-repo only.)
   - Skip aggregate-gate enforcement. Warn the user once that they are
     taking responsibility for correctness.
5. **Update CHANGELOG.md** before committing (see Changelog Update below).
   In multi-repo mode, update each repo's `CHANGELOG.md` with the
   entries belonging to that repo's commits.
6. Present shipping options via `AskUserQuestion`. Use a single question
   with a `Ship` header and these options:
   - **Open PR (Recommended)** — push the branch and open a PR. Any
     uncommitted final changes (typically `CHANGELOG.md`) land as a
     single trailing ship commit. In multi-repo mode this opens **one
     PR per repo with commits** and cross-links them.
   - **Keep commits locally** — leave commits on the branch(es) without
     opening any PR.
   - **Keep as-is** — leave final changes uncommitted.
7. Execute the user's choice. In multi-repo mode, push each repo's
   branch independently and open one PR per repo. Cross-link the PRs
   in their bodies (see PR Body Template below).
8. **Tracking ticket.** If `ticketId` is non-null, surface it in the
   completion report so the user can close it in their tracking system.
   The orchestrator does not close tickets automatically.
9. **Worktree cleanup.** For each worktree that was created in the
   Worktree phase, cherry-pick or rebase commits onto the target branch
   in that repo, then let Claude Code (or `git -C <repo-path> worktree
   remove`) remove the worktree. In multi-repo mode, run cleanup for
   every involved repo.

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

In multi-repo mode, append a `## Companion PRs` section to each PR
listing the URLs of every other PR opened for the same topic, so a
reviewer can navigate the full change set:

```
## Companion PRs
This change spans multiple repos. The companion PRs are:
- [<repo-name>] <pr-url>
- [<repo-name>] <pr-url>
```

Open the PRs first to obtain URLs, then edit each PR's body to add the
section once all URLs are known.

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
