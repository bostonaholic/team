## Execution

`<team-pr-skill-dir>` is the absolute directory that holds the installed `skills/team-pr/SKILL.md`.

1. **Detect mode and inventory worktrees with commits.** If `$ARGUMENTS/4-repos.md` exists, you are in **multi-repo mode**; its `## Worktrees` section gives each repo's worktree path. Run step 2's script for each involved worktree (single-repo: the current one); skip any with `ahead=0`. With no worktree left after the skip, in either mode, report "Nothing to ship." and stop.
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
   A screenshot problem never blocks the PR. In standalone mode, capture into a run-scoped `$(mktemp -d)` directory and bind it as `$ARGUMENTS` for the capture and upload steps.
5. **Standalone path** — no matching artifact directory (single-repo only):
   - From step 2: `ahead=0` with `dirty=0`, or with `dirty` above 0 and `git status` showing nothing worth shipping: report "Nothing to ship." and stop.
   - No review record applies. Warn the user once that they take responsibility for correctness.
6. **Update an existing CHANGELOG.md** before committing, per [Changelog Update](05-changelog-update.md). In multi-repo mode, per repo with only that repo's entries.
7. **Open a draft PR automatically — do not stop to ask.** Uncommitted final changes (typically `CHANGELOG.md`) land as one trailing ship commit before Open. Dispatch Open per repo, which calls `opening-prs` with that repo's inputs file. Multi-repo mode opens **one draft PR per repo with commits**.
8. In multi-repo mode, after every Open returns, write `## Companion PRs` into each inputs file, then dispatch Open again per repo with that repo's PR URL, so each PR links the others.
9. **Tracking ticket — link now, in-review when ready.** If `ticketId` is non-null, apply [tracking rules](tracking.md). The main session writes the closing line string they give under `## Closing line` in each inputs file.
10. **After every push to a PR, refresh its description** — the initial open and every push that adds, removes, or changes commits (review feedback, fixups, rebases). Run the order in `## Step dispatch` again from step 1, and each Open refreshes its PR. Review comments run again after each push to the home PR, unless the body has a line exactly `## Review notes`.
11. **Leave the worktree(s) in place.** Clean up only after merge or on explicit user request, via the "Ship (teardown)" procedure in the [worktree playbook](../../team-worktree/playbooks/worktree.md), for every involved repo.

## Skill check

Before the first edit, make sure that `opening-prs`, `updating-changelogs`, and `writing-commit-messages` appear in the session's skill list. Claude Code lists them with the `bostonaholic:` prefix, such as `bostonaholic:opening-prs`. When one is absent, print `Missing skill <name>. Install or update the bostonaholic/skills collection (README "Skills that moved"), then run /team-pr <artifact-dir>.` with the missing name and this run's artifact directory, and stop. `attaching-pr-screenshots` is not on the list: its absence adds an operator note and never stops the run.

## Step dispatch

Read [step delegation](../../team/references/step-delegation.md) before the first dispatch. Inline: steps 1, 2, and 5, step 3's status binding, the skill check, the main-session headings below, the ship commit, and the ticket transition. The work below runs in fresh subagents; every brief carries the worktree path, the base branch, and the scratch directory (`$ARGUMENTS`, or the standalone `mktemp -d` directory). `<repo-slug>` is the `4-repos.md` slug, or `home` in single-repo mode.

| Subagent | Brief adds | Edits | Returns |
| --- | --- | --- | --- |
| Inputs | [Input](01-input.md); `1-task.md`, `6-design.md`, and the bound review and security record paths and statuses in resume mode; skip `CHANGELOG.md`, which Changelog owns | writes only `<scratch>/pr-inputs-<repo-slug>.md`, and never its `## Closing line`, `## Capture gap`, `## Changelog`, or `## Companion PRs` heading | the inputs file path |
| Screenshots | step 4 above; the [ux reviewer brief](../../team/references/ux-reviewer.md) | the capture directory, its manifest, and `entries.json` | UI-impact decision, then the script's printed JSON, or the skip reason |
| Changelog | call `updating-changelogs`; [Changelog Update](05-changelog-update.md); the [writing standards](../../team/references/writing.md) | `CHANGELOG.md` only; no commit | the added bullets, or the skip reason |
| Open | call `opening-prs` with the inputs path, plus the PR URL in the companion refresh; the [writing standards](../../team/references/writing.md) | the push and the PR | the PR URL, the title, and `opened` or `refreshed` |
| Upload | call `attaching-pr-screenshots` with the home PR URL, `entries.json`, and the companion PR URLs from Open's returns; [Screenshot Upload](04-screenshot-upload.md) | each PR's `## Screenshots` section | the home `result.json` path, its outcome, each companion outcome, and the `operator_note` from `result.json` |
| Review comments | the PR URL; the bound review and security record paths and statuses; [Review Comments](07-review-comments.md) | PR comments only | posted, skipped, and failed comment counts |

The main session writes these headings into `<scratch>/pr-inputs-<repo-slug>.md` with the file-writing tool, never a shell command, and omits a heading it holds no value for:

| Heading | Value | When |
| --- | --- | --- |
| `## Closing line` | the string from [tracking rules](tracking.md) | after Inputs, Screenshots, and Changelog all return, before Open starts |
| `## Capture gap` | the capture gap from the Screenshots return | same |
| `## Changelog` | that repo's Changelog return, verbatim | same |
| `## Companion PRs` | one `- [<repo-name>] <pr-url>` line per other repo's PR | multi-repo only, after every Open returns, before the companion refresh starts |

Order, for every run:

1. Inline: steps 1, 2, 3, and 5, then the skill check.
2. Together: Inputs per repo, Screenshots once, Changelog per repo.
3. Inline, after all return: `## Closing line`, `## Capture gap`, and `## Changelog` per repo, then the ship commit per repo.
4. Open per repo, in parallel.
5. Multi-repo: inline `## Companion PRs` per file, then Open in refresh mode per repo, with each URL from step 4's return.
6. Together: Upload when `manifest-entries.mjs` exited 0, and Review comments on the home PR.
