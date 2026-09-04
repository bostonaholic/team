## Execution

1. **Detect mode and inventory worktrees with commits.**
   - Read `$ARGUMENTS/4-repos.md` if present. When present, you are in
     **multi-repo mode** — read the `## Worktrees` section to get each
     repo's worktree path.
   - For each involved worktree (single-repo: just the current one,
     multi-repo: every repo's worktree from `4-repos.md`), check whether it
     has commits ahead of its base branch. Skip any with no commits.
2. **Detect the base branch (per repo):**
   ```
   git -C <worktree-path> symbolic-ref refs/remotes/origin/HEAD \
     | sed 's@^refs/remotes/origin/@@'
   ```
   Falls back to `main` per repo.
3. **Resume path** — `$ARGUMENTS/1-task.md` exists: read `ticketId` from
   its frontmatter. Read `$ARGUMENTS/6-design.md` for the "why" behind the
   changes.
4. **Read the screenshot manifest** (resume mode only). Check for
   `$ARGUMENTS/screenshots/manifest.md`, written by ux-reviewer during
   Implement. If the manifest is absent, the PR body carries no
   Screenshots section — non-UI changes are never forced to include one.
   If present, parse its frontmatter and `## Captured` / `## Skipped`
   body for the Screenshots section (see PR Body Template below).
5. **Standalone path** — no matching artifact directory:
   - Verify the branch has commits ahead of the base, or uncommitted
     changes worth shipping. If neither, report "Nothing to ship." and
     stop. (Standalone mode is single-repo only.)
   - Skip aggregate-gate enforcement. Warn the user once that they are
     taking responsibility for correctness.
6. **Update CHANGELOG.md** before committing (see Changelog Update below).
   In multi-repo mode, update each repo's `CHANGELOG.md` with the
   entries belonging to that repo's commits.
7. **Open a draft PR automatically — do not stop to ask.** The PR phase
   never waits for approval. Opening the PR requires no approval. Push the
   branch and open the PR as a **draft** (`gh pr create --draft`). Pass the
   body to `gh pr create`/`gh pr edit` through `--body-file` or a quoted
   heredoc — never interpolated into a double-quoted shell argument. Any
   uncommitted final changes (typically `CHANGELOG.md`) land as a single
   trailing ship commit before the push. In multi-repo mode this opens
   **one draft PR per repo with commits** and cross-links them. When a
   capture manifest exists, the screenshot upload runs after the PR opens
   (see Screenshot Upload below).
8. In multi-repo mode, push each repo's branch independently and open one
   draft PR per repo. Cross-link the PRs in their bodies (see PR Body
   Template below).
9. **Tracking ticket — link now, in-review when ready.** If `ticketId` is
   non-null, call the Skill tool with `tracking-tickets` and apply its
   ticket-lifecycle rules. Render the ticket link as the closing line that the PR Body Template below ends with. That skill owns
   the `ticketId` interpretation, the omit-when-null rule, the multi-repo
   home-only closing rule, and the in-review timing. The ticket keeps its
   in-progress state while the PR is a draft. It moves to in-review only
   once the PR is marked ready for review. The template owns where the
   footer goes). Best-effort. Never block the pipeline. Surface the
   `ticketId` in the completion report.
10. **Whenever you push to a PR, review and adjust its description.** This
   applies to any push that adds, removes, or changes commits on a PR's
   branch. It covers the initial open *and* every follow-up push, such as
   review feedback, fixups, and rebases. After each one, re-read the body
   against the now-pushed commits and updating it
   (`gh pr edit --body-file`, or a quoted heredoc per step 7) so the
   Summary, Changes, and How-to-Verify sections still match what the branch
   actually does. **Screenshots go stale the same way the prose does.**
   When the push changed the UI, call the Skill tool with `verifying-ux` and
   re-capture per its "Screenshot Capture (UI projects)" section. It wipes
   and recaptures. Then re-render and re-upload the `## Screenshots`
   section, per the rules below, so the embedded images show the UI the
   branch now produces. When the push left the UI alone, the refresh
   carries the uploaded `## Screenshots` section through verbatim: never
   dropped, never re-uploaded — the asset URLs already in the body stay
   valid. A re-capture that cannot run falls back to the degraded note the
   rendering rules define. A screenshot problem never blocks or delays the
   push. The footer survives every refresh too: when the body carries a
   closing line (the home repo's PR of a ticketed topic), each refresh
   re-emits **exactly one** closing line in footer position — never
   duplicated, never dropped. A companion PR re-emits its non-closing
   reference the same way, and a PR with no ticket has no closing line to
   re-emit. The post-open `## Companion PRs` section is likewise preserved
   on every refresh. Never leave a stale description after a push. In
   multi-repo mode, do this for each repo's PR whose branch you pushed.
11. **Leave the worktree(s) in place.** Do not remove a worktree after
   opening a PR — the user may need to iterate on the branch (push
   follow-up commits, address review feedback). Clean up only after the
   PR is merged or when the user explicitly asks. Call the Skill tool with
   `worktree-isolation` and follow
   its "Ship (teardown)" procedure:
   commit preservation, worktree and branch removal, the rebase-only
   default-branch update, and deletion of the feature's untracked
   `docs/plans/<id>` scratch dir. In multi-repo mode, run cleanup for
   every involved repo.
