### Orchestrator-Emit Gate (PR / ship)

When the aggregate gate passes:

1. Update `CHANGELOG.md`: call the Skill tool with `changelog` and apply it
   — bullets go under `## [Unreleased]`. In multi-repo mode, update each repo's
   `CHANGELOG.md` with the entries belonging to that repo's commits.
2. **Never version here.** Do not touch a version string, cut a dated
   changelog section, or put a version in the PR title. A version is
   assigned at land time against the base branch's tip, so one assigned
   now is stale the moment another PR merges. A project invariant that
   reports this branch owing a bump names a precondition for *merging* —
   it is not a cue to bump now.
3. **Open a draft PR automatically — do not stop to ask.** The PR phase
   never waits for approval. Push the branch and
   open the PR as a **draft** (`gh pr create --draft`). Call the Skill tool
   with `team-pr` for the canonical procedure.
4. In multi-repo mode this opens
   **one draft PR per repo with commits ahead**. The PR bodies cross-link
   to each other, so reviewers can see the full change set.
5. **Ticket — link now, in-review when ready.** If `1-task.md` frontmatter
   has `ticketId` set, call the Skill tool with `tracking-tickets` and apply
   its ticket-lifecycle rules. Link the PR to the ticket through the
   conditional closing footer (in multi-repo mode the home repo's PR
   alone carries the closing keyword. Companions get a non-closing
   qualified reference). Keep the ticket in-progress while the PR is a
   draft. Move it to in-review only once the PR is marked ready for review.
   Never close the ticket by hand, because the link auto-closes it on
   merge. Best-effort. Never block the pipeline. Surface the `ticketId` in
   the completion report, alongside the draft PR URL and the absolute
   worktree-rooted `docs/plans/<id>/` artifact path.
6. Mark all TodoWrite items complete.
7. **Leave the worktree(s) in place.** Do not remove a worktree when a PR
   is opened. The user can need to iterate on the branch, to push follow-up
   commits or address review feedback. Clean up a worktree only after its
   PR is merged or when the user explicitly asks. Call the Skill tool with
   `worktree-isolation` and follow
   its "Ship (teardown)" procedure:
   commit preservation, worktree and branch removal, the rebase-only
   default-branch update, and deletion of the feature's untracked
   `docs/plans/<id>` scratch dir. In multi-repo mode, run it for every
   involved repo.
