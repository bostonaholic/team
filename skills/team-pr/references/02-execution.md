## Execution

`<team-pr-skill-dir>` is the absolute directory that holds the installed `skills/team-pr/SKILL.md`.

1. **Detect mode and inventory worktrees with commits.** If `$ARGUMENTS/4-repos.md` exists, you are in **multi-repo mode**; its `## Worktrees` section gives each repo's worktree path. Run step 2's script for each involved worktree (single-repo: the current one); skip any with `ahead=0`, except a worktree with `dirty` above 0 in standalone mode, which step 5 judges. With no worktree left after the skip, report "Nothing to ship." and stop.
2. **Detect the base branch (per repo).** Run `"<team-pr-skill-dir>/scripts/ship-state.sh" <worktree-path>`. Exit 0 prints `base=`, `ahead=`, and `dirty=`; bind `base` as that repo's base branch. Exit 2: report its stderr line and stop.
3. **Resume path** — `$ARGUMENTS/1-task.md` exists: read `ticketId` from its frontmatter, and `$ARGUMENTS/6-design.md` for the "why".
   Read the newest `$ARGUMENTS/review-<n>.md` and the newest `$ARGUMENTS/security-review-<n>.md` once each, before any edit outside `docs/plans/` (this run's or a caller's), so before steps 6 and 7. Record states are in the [artifact schema](../../team/references/artifacts.md). Resolve the worktrees by the home-worktree order in [the team-code-review input](../../team-code-review/references/01-input.md). For the whole run, bind the review record path with one review status, and the security record path with one security status. Each status is one of:
   - `current`: the newest record is PASS and current.
   - `stale`: the newest record is PASS and stale.
   - `missing`: no record exists, or the newest record is FAIL or malformed.
   In either mode, gather the shared [inputs](01-input.md) for each changed repository.
4. **Decide UI impact and resolve the screenshot manifest.** Apply the [ux reviewer brief](../../team/references/ux-reviewer.md)'s `## Screenshot Capture (UI projects)` UI-impact gate to the full branch diff, never this round's delta. A backend change that alters the interface counts; when uncertain, capture. Only a branch that does not change the interface skips the capture and the upload. Run `node "<team-pr-skill-dir>/scripts/manifest-entries.mjs" "$ARGUMENTS" "$ARGUMENTS/entries.json"`:
   - Exit 0 (`render`): the entries file feeds the upload.
   - Exit 1 (`capture-gap`), not a non-UI change: run the brief's capture procedure, then the script again. A second exit 1 returns its `reason` as the capture gap.
   - Exit 2 is a fault: return its stderr line as the capture gap.
   On a step 10 refresh, capture again only when the pushed commits change the interface. When they do, run the brief's capture procedure, then the script once. Exit 0 feeds the upload of the new images. Exit 1 returns its `reason` as the capture gap, and exit 2 returns its stderr line. When the pushed commits do not change the interface, skip the capture and the script and return `unchanged`. Upload does not run. The attached images and the `## Capture gap` heading stay as the last run left them.
   A screenshot problem never blocks the PR. In standalone mode, capture into a run-scoped `$(mktemp -d)` directory and bind it as `$ARGUMENTS` for the capture and upload steps.
5. **Standalone path** — no matching artifact directory (single-repo only):
   - From step 2: `ahead=0` with `dirty=0`, or with `dirty` above 0 and `git status` showing nothing worth shipping: report "Nothing to ship." and stop.
   - No review record applies. Warn the user once that they take responsibility for correctness.
6. **Update an existing CHANGELOG.md** under `## [Unreleased]` before committing, per [Changelog Update](05-changelog-update.md); never create one. In multi-repo mode, per repo with only that repo's entries.
7. **Open a draft PR automatically — do not stop to ask.** Uncommitted final changes (typically `CHANGELOG.md`) land as one trailing ship commit before Open. With no uncommitted change, make no ship commit. Dispatch Open per repo. Open always pushes the branch first. It then opens a draft PR from that repo's inputs file, or, given a PR URL, refreshes that PR's body. Multi-repo mode opens **one draft PR per repo with commits**.
8. In multi-repo mode, after every Open returns, write `## Companion PRs` into each inputs file, then dispatch Open again per repo with that repo's PR URL to refresh its body, so each PR links the others. A step 10 refresh writes it before Open instead.
9. **Tracking ticket — link now, in-review when ready.** If `ticketId` is non-null, apply [tracking rules](tracking.md). The main session writes the closing line string they give under `## Closing line` in each inputs file.
10. **After each later push to an open PR, refresh its description.** A later push comes after the PR exists and adds, removes, or changes commits (review feedback, fixups, rebases). Open's own pushes start no refresh, in the first run or in a refresh, and they carry every ship commit (step 7). Run the order in `## Step dispatch` again from step 1 as a refresh, in either mode. A refresh follows these rules:
   - Changelog adds no bullet for a change `## [Unreleased]` already lists ([Changelog Update](05-changelog-update.md)). A refresh with no new change makes no ship commit (step 7).
   - Screenshots captures again only when the pushed commits change the interface (step 4).
   - Open gets each PR's URL and refreshes that PR's body.
   - Multi-repo: write `## Companion PRs` in order step 3, from the known PR URLs. Skip order step 5.
   - Review comments run again after each push to the home PR, unless the body has a line exactly `## Review notes`.
11. **Leave the worktree(s) in place.** Clean up only after merge or on explicit user request, via the "Ship (teardown)" procedure in the [worktree playbook](../../team-worktree/playbooks/worktree.md), for every involved repo.

## Step dispatch

Read [step delegation](../../team/references/step-delegation.md) before the first dispatch. Inline: steps 1, 2, and 5, step 3's status binding, the main-session headings below, the ship commit, and the ticket transition. The work below runs in fresh subagents; every brief carries the worktree path, the base branch, and the scratch directory (`$ARGUMENTS`, or the standalone `mktemp -d` directory). `<repo-slug>` is the `4-repos.md` slug, or `home` in single-repo mode.

| Subagent | Brief adds | Edits | Returns |
| --- | --- | --- | --- |
| Inputs | [Input](01-input.md); `1-task.md`, `6-design.md`, and the bound review and security record paths and statuses in resume mode; skip `CHANGELOG.md`, which Changelog owns | writes only `<scratch>/pr-inputs-<repo-slug>.md`, and rewrites every heading in it from this run's facts except `## Closing line`, `## Capture gap`, `## Changelog`, and `## Companion PRs`, which it leaves as it finds them | the inputs file path |
| Screenshots | step 4 above; the [ux reviewer brief](../../team/references/ux-reviewer.md); on a refresh, the pushed commit range | the capture directory, its manifest, and `entries.json` | UI-impact decision, then the script's printed JSON, `unchanged`, or the skip reason |
| Changelog | [Changelog Update](05-changelog-update.md); the [writing standards](../../team/references/writing.md) | `CHANGELOG.md` only; no commit | this branch's bullets under `## [Unreleased]`, both added and already listed, or the skip reason |
| Open | the inputs path, plus the PR URL in the companion refresh and in every step 10 refresh; the [writing standards](../../team/references/writing.md) | the push and the PR | the PR URL, the title, and `opened` or `refreshed` |
| Upload | the home PR URL, `entries.json`, and the companion PR URLs from Open's returns; [Screenshot Upload](04-screenshot-upload.md) | each PR's screenshots | each PR's outcome, and each failure with its reason |
| Review comments | the PR URL; the bound review and security record paths and statuses; [Review Comments](07-review-comments.md) | PR comments only | posted, skipped, and failed comment counts |

The main session writes these headings into `<scratch>/pr-inputs-<repo-slug>.md` with the file-writing tool, never a shell command. Every run writes each heading that has a value in this run and removes each heading that has none, even when an earlier run wrote it. Only `## Capture gap` stays as the last run left it, when Screenshots returns `unchanged` (step 4).

| Heading | Value | When |
| --- | --- | --- |
| `## Closing line` | the string from [tracking rules](tracking.md) | after Inputs, Screenshots, and Changelog all return, before Open starts |
| `## Capture gap` | the capture gap from the Screenshots return | same |
| `## Changelog` | that repo's Changelog return, verbatim | same |
| `## Companion PRs` | one `- [<repo-name>] <pr-url>` line per other repo's PR | multi-repo only, after every Open returns, before the companion refresh starts; on a step 10 refresh, with the other headings, from the known PR URLs |

Order, for every run:

1. Inline: steps 1, 2, 3, and 5.
2. Together: Inputs per repo, Screenshots once, Changelog per repo.
3. Inline, after all return: `## Closing line`, `## Capture gap`, and `## Changelog` per repo, then the ship commit per repo that has uncommitted changes. On a step 10 refresh in multi-repo mode, write `## Companion PRs` here too, before the ship commit.
4. Open per repo, in parallel.
5. Multi-repo, except on a step 10 refresh: inline `## Companion PRs` per file, then Open in refresh mode per repo, with each URL from step 4's return.
6. Together: Upload when `manifest-entries.mjs` exited 0 in this run, and Review comments on the home PR.
