---
name: team-pr
description: Open the pull request after verification passes. Updates the changelog, optionally surfaces the tracking ticket, and closes out the topic. Trigger on "open the PR", "open a draft PR", or "/team-pr". To land/merge a reviewed PR (wait for CI, then squash-merge) use the separate /shipit skill — "ship it", "land the PR", and "land this" trigger /shipit, not this skill.
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team PR — Create the Pull Request

Run the PR phase. Two modes:

- **Resume mode** — Implement passed the aggregate gate; the topic
  branch has slice commits ready. `$ARGUMENTS/task.md` and
  `$ARGUMENTS/design.md` exist.
- **Standalone mode** — no matching artifact directory, but the working
  tree has commits or staged changes ready to ship. Treat the current
  branch as the work source.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it for the **resume** path (discovery only
augments resume — the standalone path is unchanged).

The PR description is grounded in `$ARGUMENTS/design.md`. The ticket
identifier (if any) is read from `$ARGUMENTS/task.md`'s frontmatter.

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A) — shared script.
# Single source: skills/qrspi-workflow/discover-topic.sh (was duplicated 8x).
# Args: <pred> <require_approved> <explicit_dir>; scans docs/plans/ in cwd.
bash "${CLAUDE_PLUGIN_ROOT}/skills/qrspi-workflow/discover-topic.sh" "design.md" "" "$ARGUMENTS"
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the resume path
  (tier 1 explicit arg, or tier 2 discovery of a directory holding `design.md`).
  When the path came from tier 2 (no explicit arg), announce the resolved
  directory to the user before proceeding, so an auto-picked topic is never
  silent.
- **If the block printed nothing** (tier 3 — no matching directory), do not
  hard-error. The working tree may still have commits to ship: fall through to
  the **Standalone path** in `## Execution`, which detects the base branch
  (archetype B) and stops with "Nothing to ship." only when there is nothing
  ahead of the base.

## Execution

> Follow `skills/progress-tracking/SKILL.md`: when this procedure has two or more steps, seed one todo item per step before starting and mark each complete as you go.

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
6. **Open a draft PR automatically — do not stop to ask.** The PR phase
   is not a human gate; opening the PR requires no approval. Push the
   branch and open the PR as a **draft** (`gh pr create --draft`). Any
   uncommitted final changes (typically `CHANGELOG.md`) land as a single
   trailing ship commit before the push. In multi-repo mode this opens
   **one draft PR per repo with commits** and cross-links them.
7. In multi-repo mode, push each repo's branch independently and open one
   draft PR per repo. Cross-link the PRs in their bodies (see PR Body
   Template below).
8. **Tracking ticket → in-review.** If `ticketId` is non-null:
   - **Link the PR to the ticket** so the tracker closes the ticket — and
     any board automation moves it to its done state — when the PR merges.
     For GitHub, put `Closes #<n>` in the PR body; for another tracker use
     its PR↔issue link. This link is what drives the eventual move to done
     on merge, so the orchestrator never closes tickets by hand.
   - **Move the ticket to the tracker's in-review state.** Best-effort and
     tracker-agnostic: if the project defines no tracker-move mechanism,
     skip silently. Never block the pipeline on a tracker update.
   - Surface the `ticketId` in the completion report.
9. **Whenever you push to a PR, review and adjust its description.** Any
   push that adds, removes, or changes commits on a PR's branch — the
   initial open *and* every follow-up push (review feedback, fixups,
   rebases) — must be followed by re-reading the current PR body against
   the now-pushed commits and updating it (`gh pr edit --body`) so the
   Summary, Changes, and How-to-Verify sections still match what the
   branch actually does. Never leave a stale description after a push. In
   multi-repo mode, do this for each repo's PR whose branch you pushed.
10. **Leave the worktree(s) in place.** Do not remove a worktree after
   opening a PR — the user may need to iterate on the branch (push
   follow-up commits, address review feedback). Clean up only after the
   PR is merged or when the user explicitly asks. When that happens,
   cherry-pick or rebase commits onto the target branch in that repo,
   then let Claude Code (or `git -C <repo-path> worktree remove`) remove
   the worktree; in multi-repo mode, run cleanup for every involved repo.
   After removing the worktree, bring the repo's local default branch up
   to date with the merge: `git -C <repo-root> pull --rebase origin
   <base>` (rebase, never a merge commit — the project keeps linear
   history). Do this for every involved repo in multi-repo mode. Finally,
   delete the feature's local planning docs (`rm -rf docs/plans/<id>`,
   verified untracked) as part of the same teardown — see
   `worktree-isolation`.

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

Report the outcome (draft PR URL and commit hash).
