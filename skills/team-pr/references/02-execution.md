## Execution

1. **Detect mode and inventory worktrees with commits.**
   - Read `$ARGUMENTS/4-repos.md` if present. When present, you are in
     **multi-repo mode** — read the `## Worktrees` section to get each
     repo's worktree path.
   - For each involved worktree (single-repo: the current one; multi-repo:
     each from `4-repos.md`), check whether it has commits ahead of its base
     branch. Skip any with no commits.
2. **Detect the base branch (per repo):**
   ```
   git -C <worktree-path> symbolic-ref refs/remotes/origin/HEAD \
     | sed 's@^refs/remotes/origin/@@'
   ```
   Falls back to `main` per repo.
3. **Resume path** — `$ARGUMENTS/1-task.md` exists: read `ticketId` from
   its frontmatter. Read `$ARGUMENTS/6-design.md` for the "why" behind the
   changes.
   In either mode, gather the shared [inputs](01-input.md) for each changed repository.
4. **Decide UI impact and resolve the screenshot manifest.** Read the
   [ux reviewer brief](../team/references/ux-reviewer.md) and apply its
   `## Screenshot Capture (UI projects)` UI-impact gate to the full branch
   diff, never this round's delta. A backend change that alters the interface
   counts. When UI impact is uncertain, capture. Only a branch that does not
   change the interface omits the section — non-UI changes are never forced to
   include one. A branch that does change it must carry the section, so
   capture when needed:
   - `$ARGUMENTS/screenshots/manifest.md` holding `## Captured` entries whose
     PNGs exist on disk is the manifest to render. Parse its frontmatter and
     `## Captured` / `## Skipped` body for the Screenshots section (see PR
     Body Template below).
   - Any other manifest state — absent, malformed, `status` any `skipped-*`
     value, or every listed PNG missing — is a capture gap, not a non-UI
     change. Run the brief's capture procedure now and render the manifest
     it writes.
   In standalone mode no artifact directory exists, so capture into a
   run-scoped `$(mktemp -d)` directory and bind that directory as `$ARGUMENTS`
   for the capture and upload steps.
5. **Standalone path** — no matching artifact directory:
   - Verify the branch has commits ahead of the base, or uncommitted
     changes worth shipping. If neither, report "Nothing to ship." and
     stop. (Standalone mode is single-repo only.)
   - Skip aggregate-gate enforcement. Warn the user once that they are
     taking responsibility for correctness.
6. **Update an existing CHANGELOG.md** before committing (see Changelog Update
   below). If the root file is absent, leave it absent and report the skip
   unless the user explicitly requested a new changelog. In multi-repo mode,
   apply this rule per repo and add only that repo's entries.
7. **Open a draft PR automatically — do not stop to ask.** Push the branch
   and open the PR as a **draft** (`gh pr create --draft`). Pass the
   body to `gh pr create`/`gh pr edit` through `--body-file` or a quoted
   heredoc — never interpolated into a double-quoted shell argument. Any
   uncommitted final changes (typically `CHANGELOG.md`) land as a single
   trailing ship commit before the push. In multi-repo mode this opens
   **one draft PR per repo with commits** and cross-links them. When a
   capture manifest exists, the screenshot upload runs after the PR opens
   (see Screenshot Upload below). After `gh pr create`, and in multi-repo
   mode after the `## Companion PRs` edit, read
   [review comments](07-review-comments.md) and run it on the home PR
   before the hand-off.
8. In multi-repo mode, push each repo's branch independently. Cross-link the
   PRs in their bodies (see PR Body Template below).
9. **Tracking ticket — link now, in-review when ready.** If `ticketId` is
   non-null, read [tracking rules](tracking.md) and apply its
   ticket-lifecycle rules. Render the ticket link as the closing line that
   the PR Body Template below starts with. Best-effort. Never block the
   pipeline.
10. **Whenever you push to a PR, review and adjust its description.** This
   applies to any push that adds, removes, or changes commits on a PR's
   branch, including the initial open *and* every follow-up push (such as review
   feedback, fixups, and rebases). After each one, re-read the body
   against the now-pushed commits and update it
   (`gh pr edit --body-file`, or a quoted heredoc per step 7) so the
   explanations, terminology, representations, evidence, merge risk, and references match the pushed diff.
   Reassess these facts through the shared input and body authoring rules.
   Retain claims only when available evidence supports them.
   Label earlier-commit evidence and unresolved current coverage when prior checks no longer prove the changed behavior.
   When the push changed the UI, read the
   [ux reviewer brief](../team/references/ux-reviewer.md) and
   re-capture per its "Screenshot Capture (UI projects)" section (it wipes
   and recaptures). Then re-render the `## Screenshots` section and run the
   Screenshot Upload procedure again, so the embedded images show the UI the
   branch now produces. When the push left the UI alone, the refresh
   carries the uploaded `## Screenshots` section through verbatim: never
   dropped, never re-run — the asset URLs already in the body stay
   valid. A re-capture that cannot run falls back to the
   degraded note the rendering rules define. A screenshot problem never
   blocks or delays the push. When the body carries a closing line (the
   home repo's PR of a ticketed topic), each refresh re-emits **exactly
   one** closing line as the body's first line — never duplicated, never
   dropped, never moved.
   A companion PR re-emits its non-closing reference the same way, and a PR
   with no ticket has no closing line to re-emit. The post-open
   `## Companion PRs` section is likewise preserved on every refresh. After
   each push to the home PR, run [review comments](07-review-comments.md)
   again, so a comment or the code review that failed to post earlier posts
   now. When the
   current body has a line exactly `## Review notes`, the PR predates that
   step: carry the section through verbatim, and skip the step. Never
   leave a stale description after a push. In multi-repo mode, do this for
   each repo's PR whose branch you pushed.
11. **Leave the worktree(s) in place.** Do not remove a worktree after
   opening a PR. Clean up only after the PR is merged or when the user
   explicitly asks. Read the
   [worktree playbook](../team-worktree/playbooks/worktree.md) and follow
   its "Ship (teardown)" procedure:
   commit preservation, worktree and branch removal, the rebase-only
   default-branch update, and deletion of the feature's untracked
   `docs/plans/<id>` scratch dir. In multi-repo mode, run cleanup for
   every involved repo.

## Step dispatch

Read [step delegation](../team/references/step-delegation.md) before the
first dispatch. Mode and worktree inventory, base-branch detection, the
standalone checks, the ship commit, every push, `gh pr create`, the
`## Companion PRs` edit, and the ticket transition stay inline. The work
below runs in fresh subagents. The scratch directory is `$ARGUMENTS`, or the
run-scoped `mktemp -d` directory in standalone mode. Every brief carries the
worktree path, the base branch, and the scratch directory.

| Subagent | Brief adds | Edits | Returns |
| --- | --- | --- | --- |
| Inputs | [Input](01-input.md); `1-task.md` and `6-design.md` in resume mode; skip `CHANGELOG.md`, which Changelog owns | writes only `<scratch>/pr-inputs.md` | the `pr-inputs.md` path: project terms, the why, available check results, evidence gaps |
| Screenshots | step 4 above; the [ux reviewer brief](../team/references/ux-reviewer.md) | the capture directory and its manifest | UI-impact decision, the manifest path or the skip reason |
| Changelog | [Changelog Update](05-changelog-update.md) | `CHANGELOG.md` only; no commit | the added bullets, or the absent-file skip |
| Body | `pr-inputs.md`; the manifest; the Changelog return; the [PR Body Template](03-pr-body-template.md); the [writing standards](../team/references/writing.md) | writes only `<scratch>/pr-body.md` | the `pr-body.md` path and the title |
| Upload | the PR URL; the manifest; [Screenshot Upload](04-screenshot-upload.md) | the PR body's `## Screenshots` section | uploaded asset count, or the degraded-note reason |
| Review comments | the PR URL; [Review Comments](07-review-comments.md); when the session's round result `<id>` equals this PR phase's `<id>`, the reviewed commit, the verdict, and the findings, else the reason none is carried | PR comments and the code review only | posted, skipped, and failed comment counts, and the code review outcome |

Dispatch Inputs, Screenshots, and Changelog together. Body starts after
all three return. Open the PR inline from `pr-body.md`. Then
dispatch Upload and Review comments together. A step 10 refresh re-runs
Body with the pushed commits, then Upload when the UI changed, then Review
comments. In multi-repo mode, dispatch Inputs, Changelog, and Body once per
repo with commits.
