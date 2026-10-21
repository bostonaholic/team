### Orchestrator-Emit Gate (PR / ship)

When the newest `review-<n>.md` and the newest `security-review-<n>.md` both
carry PASS and are current:

1. **Edit nothing before `team-pr` binds the review and security statuses.**
   Leave `CHANGELOG.md` to `team-pr`: its execution step 3 binds both
   statuses from the newest `review-<n>.md` and the newest
   `security-review-<n>.md`, and only then does its step 6 apply the
   [changelog rules](../team-pr/references/changelog.md). A record is
   current only over a tree clean outside `docs/plans/`, so an edit here
   would bind `stale`.
2. **Never version here.** Do not touch a version string, cut a dated
   changelog section, or put a version in the PR title. A project invariant
   that reports this branch owing a bump names a precondition for *merging* —
   it is not a cue to bump now.
3. **Open a draft PR automatically — do not stop to ask.** Push the branch and
   open the PR as a **draft** (`gh pr create --draft`). Call the Skill tool
   with `team-pr` for the canonical procedure.
4. In multi-repo mode this opens
   **one draft PR per repo with commits ahead**. The PR bodies cross-link
   to each other, so reviewers can see the full change set.
5. **Ticket — link now, in-review when ready.** If `1-task.md` frontmatter
   has `ticketId` set, read [tracking rules](../team-pr/references/tracking.md) and apply
   its ticket-lifecycle rules. Link the PR to the ticket through the
   conditional closing line at the top of the body (in multi-repo mode the home repo's PR
   alone carries the closing keyword. Companions get a non-closing
   qualified reference). Keep the ticket in-progress while the PR is a
   draft. Move it to in-review only once the PR is marked ready for review.
   Never close the ticket by hand; the link auto-closes it on merge.
   Best-effort. Never block the pipeline. Surface the `ticketId` in
   the completion report, alongside the draft PR URL and the absolute
   worktree-rooted `docs/plans/<id>/` artifact path.
6. Mark all TodoWrite items complete.
7. **Leave the worktree(s) in place.** Do not remove a worktree when a PR
   is opened. Clean up a worktree only after its
   PR is merged or when the user explicitly asks. Read the
   [worktree playbook](../team-worktree/playbooks/worktree.md) and follow
   its "Ship (teardown)" procedure:
   commit preservation, worktree and branch removal, the rebase-only
   default-branch update, and deletion of the feature's untracked
   `docs/plans/<id>` scratch dir. In multi-repo mode, run it for every
   involved repo.
