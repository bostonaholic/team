## Execution

`<team-pr-skill-dir>` is the absolute directory that holds the installed `skills/team-pr/SKILL.md`.

1. **Detect mode and inventory worktrees with commits.** If `$ARGUMENTS/4-repos.md` exists, you are in **multi-repo mode**; its `## Worktrees` section gives each repo's worktree path. Run step 2's script for each involved worktree (single-repo: the current one); skip any with `ahead=0`.
2. **Detect the base branch (per repo).** Run `"<team-pr-skill-dir>/scripts/ship-state.sh" <worktree-path>`. Exit 0 prints `base=`, `ahead=`, and `dirty=`; bind `base` as that repo's base branch. Exit 2: report its stderr line and stop.
3. **Resume path** — `$ARGUMENTS/1-task.md` exists: read `ticketId` from its frontmatter, and `$ARGUMENTS/6-design.md` for the "why".
   Read the newest `$ARGUMENTS/review-<n>.md` and the newest `$ARGUMENTS/security-review-<n>.md` once each, before any edit outside `docs/plans/` (this run's or a caller's), so before steps 6 and 7. Record states are in the [artifact schema](../team/references/artifacts.md). Resolve the worktrees by the home-worktree order in [the team-code-review input](../team-code-review/references/01-input.md). For the whole run, bind the review record path with one review status, and the security record path with one security status. Each status is one of:
   - `current`: the newest record is PASS and current.
   - `stale`: the newest record is PASS and stale.
   - `missing`: no record exists, or the newest record is FAIL or malformed.
   In either mode, gather the shared [inputs](01-input.md) for each changed repository.
4. **Decide UI impact and resolve the screenshot manifest.** Apply the [ux reviewer brief](../team/references/ux-reviewer.md)'s `## Screenshot Capture (UI projects)` UI-impact gate to the full branch diff, never this round's delta. A backend change that alters the interface counts; when uncertain, capture. Only a branch that does not change the interface omits the section. Run `node "<team-pr-skill-dir>/scripts/manifest-entries.mjs" "$ARGUMENTS" "$ARGUMENTS/entries.json"`:
   - Exit 0 (`render`): the entries file and printed `notes` feed the Screenshots section and the upload.
   - Exit 1 (`capture-gap`), not a non-UI change: run the brief's capture procedure, then the script again. A second exit 1 renders the capture-failure note with its `reason`.
   - Exit 2 is a fault: render the capture-failure note with its stderr line.
   A screenshot problem never blocks the PR. In standalone mode, capture into a run-scoped `$(mktemp -d)` directory and bind it as `$ARGUMENTS` for the capture and upload steps.
5. **Standalone path** — no matching artifact directory (single-repo only):
   - From step 2: `ahead=0` with `dirty=0`, or with `dirty` above 0 and `git status` showing nothing worth shipping: report "Nothing to ship." and stop.
   - No review record applies. Warn the user once that they take responsibility for correctness.
6. **Update an existing CHANGELOG.md** before committing, per [Changelog Update](05-changelog-update.md) (its absent-file rule included). In multi-repo mode, per repo with only that repo's entries.
7. **Open a draft PR automatically — do not stop to ask.** Uncommitted final changes (typically `CHANGELOG.md`) land as one trailing ship commit before the push. Push the branch and run `gh pr create --draft`. Pass every body through `--body-file` or a quoted heredoc, never a double-quoted shell argument. Multi-repo mode opens **one draft PR per repo with commits**. After `gh pr create` (and in multi-repo mode the `## Companion PRs` edit), run the [screenshot upload](04-screenshot-upload.md) when a capture manifest exists and [review comments](07-review-comments.md) on the home PR before the hand-off.
8. In multi-repo mode, push each repo's branch independently; cross-linking follows the [PR Body Template](03-pr-body-template.md).
9. **Tracking ticket — link now, in-review when ready.** If `ticketId` is non-null, apply [tracking rules](tracking.md), rendering the ticket link as the body's closing line.
10. **After every push to a PR, refresh its description** — the initial open and every push that adds, removes, or changes commits (review feedback, fixups, rebases). Update the body (`gh pr edit --body-file`, or a quoted heredoc) so every section matches the pushed diff, per the input and body authoring rules. Retain claims only when evidence supports them; label earlier-commit evidence and unresolved coverage when prior checks no longer prove the changed behavior.
   - **UI changed:** re-capture per the [ux reviewer brief](../team/references/ux-reviewer.md)'s "Screenshot Capture (UI projects)" section, re-render `## Screenshots`, and rerun the Screenshot Upload. A re-capture that cannot run falls back to the degraded note; never block the push.
   - **UI unchanged:** carry the uploaded `## Screenshots` section through verbatim; its asset URLs stay valid.
   - Re-emit **exactly one** closing line as the body's first line (the home PR of a ticketed topic) — never duplicated, dropped, or moved. A companion PR re-emits its non-closing reference the same way. Preserve the post-open `## Companion PRs` section.
   - Run [review comments](07-review-comments.md) again after each push to the home PR, unless the body has a line exactly `## Review notes`: then carry that section through verbatim.
   In multi-repo mode, do this for each repo's PR whose branch you pushed.
11. **Leave the worktree(s) in place.** Clean up only after merge or on explicit user request, via the "Ship (teardown)" procedure in the [worktree playbook](../team-worktree/playbooks/worktree.md), for every involved repo.

## Step dispatch

Read [step delegation](../team/references/step-delegation.md) before the first dispatch. Inline: steps 1, 2, 5, the ship commit, every push, `gh pr create`, the `## Companion PRs` edit, and the ticket transition. The work below runs in fresh subagents; every brief carries the worktree path, the base branch, and the scratch directory (`$ARGUMENTS`, or the standalone `mktemp -d` directory).

| Subagent | Brief adds | Edits | Returns |
| --- | --- | --- | --- |
| Inputs | [Input](01-input.md); `1-task.md`, `6-design.md`, and the bound review and security record paths and statuses in resume mode; skip `CHANGELOG.md`, which Changelog owns | writes only `<scratch>/pr-inputs.md` | the `pr-inputs.md` path: project terms, the why, available check results, evidence gaps |
| Screenshots | step 4 above; the [ux reviewer brief](../team/references/ux-reviewer.md) | the capture directory, its manifest, and `entries.json` | UI-impact decision, then the script's printed JSON, or the skip reason |
| Changelog | [Changelog Update](05-changelog-update.md) | `CHANGELOG.md` only; no commit | the added bullets, or the absent-file skip |
| Body | `pr-inputs.md`; the manifest; the Changelog return; the [PR Body Template](03-pr-body-template.md); the [writing standards](../team/references/writing.md) | writes only `<scratch>/pr-body.md` | the `pr-body.md` path and the title |
| Upload | the PR URL; the manifest; [Screenshot Upload](04-screenshot-upload.md) | the PR body's `## Screenshots` section | uploaded asset count, or the degraded-note reason |
| Review comments | the PR URL; the bound review and security record paths and statuses; [Review Comments](07-review-comments.md) | PR comments only | posted, skipped, and failed comment counts |

Dispatch Inputs, Screenshots, and Changelog together; Body starts after all three return. Open the PR inline from `pr-body.md`, then dispatch Upload and Review comments together. A step 10 refresh re-runs Body with the pushed commits, then Upload when the UI changed, then Review comments. In multi-repo mode, dispatch Inputs, Changelog, and Body once per repo with commits.
