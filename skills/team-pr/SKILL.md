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
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
# design.md is a lenient discovery proxy: the canonical PR-phase predecessor is
# "aggregate gate passed" (no single artifact), so we key on design.md to mean
# "topic progressed far enough to have design context". team-pr also runs standalone.
PRED="design.md"            # predecessor artifact this skill consumes
# Tier 1 — explicit: $ARGUMENTS names an existing dir → use verbatim.
if [ -n "$ARGUMENTS" ] && [ -d "$ARGUMENTS" ]; then
  echo "$ARGUMENTS"; exit 0
fi
# Tier 2 — discover: newest ID_RE dir under docs/plans/ that holds PRED.
best=""; best_mtime=-1
# Assumes cwd is the repo/worktree root (where docs/plans/ lives).
for dir in docs/plans/*/; do
  name="$(basename "$dir")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue   # ID_RE filter
  [ -f "$dir$PRED" ] || continue                        # predecessor filter
  m=-1
  for p in $PHASE_FILES; do
    f="$dir$p.md"
    [ -f "$f" ] || continue                             # skip racing/absent
    s="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)" || continue
    [ "${s:-0}" -gt "$m" ] && m="$s"                    # max-mtime over PHASE_FILES
  done
  [ "$m" -gt "$best_mtime" ] && { best_mtime="$m"; best="$dir"; }
done
[ -n "$best" ] && { echo "$best"; exit 0; }
# Tier 3 — none found: print nothing → fall to AskUserQuestion (prose below).
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
8. **Tracking ticket — link now, in-review when ready.** If `ticketId` is
   non-null:
   - **Link the PR to the ticket** so the tracker closes the ticket — and
     any board automation moves it to its done state — when the PR merges.
     Render the link as the closing line the PR Body Template ends with
     (GitHub: `Closes #<n>` as the final line of the PR body); for another
     tracker use its PR↔issue link. In multi-repo mode this closing line
     goes on the **home** repo's PR only — see the multi-repo rule below
     the PR Body Template. Interpret `ticketId` here, where it is
     consumed:
     - A bare number → `Closes #<n>` (a GitHub issue in the origin repo).
     - Any other non-null value → `Closes <ticketId or issue-url>`. An
       unrecognized shape is emitted verbatim and noted in the completion
       report — never block on it.
     - Null, absent, empty, or whitespace-only → omit the closing line
       entirely; no placeholder.
     This link is what drives the eventual move to done on merge, so the
     orchestrator never closes tickets by hand.
   - **Never move the ticket to in-review while the PR is a draft.** A
     draft is not under review, and this phase opens the PR as a draft —
     at open time the ticket keeps its in-progress state. Move the ticket
     to the tracker's in-review state **only once the PR is marked ready
     for review** (non-draft — on GitHub, `gh pr view --json isDraft`).
     Best-effort and tracker-agnostic: if the project defines no
     tracker-move mechanism, skip silently. Never block the pipeline on a
     tracker update.
   - Surface the `ticketId` in the completion report.
9. **Whenever you push to a PR, review and adjust its description.** Any
   push that adds, removes, or changes commits on a PR's branch — the
   initial open *and* every follow-up push (review feedback, fixups,
   rebases) — must be followed by re-reading the current PR body against
   the now-pushed commits and updating it (`gh pr edit --body`) so the
   Summary, Changes, and How-to-Verify sections still match what the
   branch actually does. The footer survives every refresh too: when the
   body carries a closing line (the home repo's PR of a ticketed topic),
   each refresh re-emits **exactly one** closing line in footer position
   — never duplicated, never dropped. A companion PR re-emits its
   non-closing reference the same way, and a PR with no ticket has no
   closing line to re-emit. Never leave a stale description after a
   push. In multi-repo mode, do this for each repo's PR whose branch you
   pushed.
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

Closes #<n>
```

The `Closes` line is a standalone footer — no heading — rendered as the
final line of the PR body. It is conditional on `ticketId`: when
`ticketId` is null, absent, or empty, omit the line entirely — no
placeholder, no empty footer.

**Placement rationale:** reviewers open a PR to read `## Summary`; the
closing line is machine-facing metadata, so the narrative comes first
and the footer comes last, mirroring the commit-footer convention in
`skills/git-commit/SKILL.md`. GitHub parses closing keywords anywhere in
the body, so the footer position costs nothing — and "last authored
line" is deterministic to emit and trivial to verify.

In multi-repo mode, only the **home** repo's PR carries the closing
keyword (`Closes #<n>`) — so the ticket closes exactly once, when the
home PR merges. Companion PRs carry a **non-closing** reference to the
issue in the same footer position, using the unambiguous qualified form
(`owner/repo#<n>` or the issue URL). A bare `#<n>` is repo-scoped — in
a companion repo it names a *different* issue — and even a qualified
*closing* form would close the ticket on the first companion merge,
before the full change set lands.

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
section once all URLs are known. This post-open edit appends the
section *after* the closing line — "final line of the PR body" refers
to creation-time authoring, so the appended `## Companion PRs` section
following it is expected, not a violation.

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
