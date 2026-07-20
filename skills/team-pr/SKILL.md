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
   is not a human gate; opening the PR requires no approval. Push the
   branch and open the PR as a **draft** (`gh pr create --draft`). Pass
   the body to `gh pr create`/`gh pr edit` via `--body-file` or a quoted
   heredoc — never interpolated into a double-quoted shell argument. Any
   uncommitted final changes (typically `CHANGELOG.md`) land as a single
   trailing ship commit before the push. In multi-repo mode this opens
   **one draft PR per repo with commits** and cross-links them.
8. In multi-repo mode, push each repo's branch independently and open one
   draft PR per repo. Cross-link the PRs in their bodies (see PR Body
   Template below).
9. **Tracking ticket — link now, in-review when ready.** If `ticketId`
   is non-null, apply the ticket-lifecycle rules in
   `skills/tracking-tickets/SKILL.md`: render the ticket link as the
   closing line the PR Body Template below ends with (that skill owns
   the `ticketId` interpretation, the omit-when-null rule, the
   multi-repo home-only closing rule, and the in-review timing — the
   ticket keeps its in-progress state while the PR is a draft and moves
   to in-review only once the PR is marked ready for review; the
   template owns where the footer goes). Best-effort; never block the
   pipeline. Surface the `ticketId` in the completion report.
10. **Whenever you push to a PR, review and adjust its description.** Any
   push that adds, removes, or changes commits on a PR's branch — the
   initial open *and* every follow-up push (review feedback, fixups,
   rebases) — must be followed by re-reading the current PR body against
   the now-pushed commits and updating it (`gh pr edit --body-file`, or
   a quoted heredoc per step 7) so the Summary, Changes, and
   How-to-Verify sections still match what the branch actually does.
   The footer survives every refresh too: when the
   body carries a closing line (the home repo's PR of a ticketed topic),
   each refresh re-emits **exactly one** closing line in footer position
   — never duplicated, never dropped. A companion PR re-emits its
   non-closing reference the same way, and a PR with no ticket has no
   closing line to re-emit; the post-open `## Companion PRs` section is
   likewise preserved on every refresh. Never leave a stale description
   after a push. In multi-repo mode, do this for each repo's PR whose
   branch you pushed.
11. **Leave the worktree(s) in place.** Do not remove a worktree after
   opening a PR — the user may need to iterate on the branch (push
   follow-up commits, address review feedback). Clean up only after the
   PR is merged or when the user explicitly asks, following the teardown
   procedure in `skills/worktree-isolation/SKILL.md` → "Ship (teardown)":
   commit preservation, worktree and branch removal, the rebase-only
   default-branch update, and deletion of the feature's untracked
   `docs/plans/<id>` scratch dir. In multi-repo mode, run cleanup for
   every involved repo.

## PR Body Template

```
## Summary
[2-3 bullets drawn from $ARGUMENTS/design.md — what and why]

## Design Decisions
[Key decisions reviewers should understand]

## Changes
[Brief description, organized by component]

## Screenshots
[Conditional — rendered from the capture manifest per the rules below;
omitted entirely when no manifest exists]

## How to Verify
- [ ] [Automated verification command]
- [ ] [Manual verification step]

## References
- Design: $ARGUMENTS/design.md
- Plan:   $ARGUMENTS/plan.md

Closes #<n>
```

The `Closes` line is a standalone footer — no heading — rendered as the
final line of the PR body. Whether it renders at all (it is conditional
on `ticketId`), how `ticketId` is interpreted, and the multi-repo
home-only closing rule are canonical in
`skills/tracking-tickets/SKILL.md`. When that skill says to omit the
line, drop its preceding blank line with it, so the body ends at the
last `## References` bullet with no trailing blank line.

**Placement rationale:** reviewers open a PR to read `## Summary`; the
closing line is machine-facing metadata, so the narrative comes first
and the footer comes last, mirroring the commit-footer convention in
`skills/git-commit/SKILL.md`. GitHub parses closing keywords anywhere in
the body, so the footer position costs nothing — and "last authored
line" is deterministic to emit and trivial to verify.

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

### Screenshots section rendering

The `## Screenshots` section is built from `$ARGUMENTS/screenshots/manifest.md`
(written by ux-reviewer during Implement):

- **Manifest absent → omit the section entirely.** Non-UI changes are never
  forced to include screenshots.
- **Manifest `status` is any `skipped-*` value, or the manifest is malformed**
  (unparseable frontmatter or body) → render a one-line capture-failure note
  naming the reason, nothing more. Never block or delay the PR over
  screenshots — the PR phase is not a human gate.
- **Each `## Captured` entry whose PNG exists on disk** renders as
  `**<caption>** (<state>)` followed by its local path. Entries whose PNG is
  missing from disk are skipped and the discrepancy noted in the section.
- **When upload is unavailable or fails**, the section renders the degraded
  form: a "captured — upload failed or unavailable" note plus the local file
  paths above. This degraded shape is the contract every upload-failure
  branch falls back to.

## Screenshot Upload

Screenshots render inline for any reviewer (including private repos) via
GitHub's user-attachments pipeline. Sequencing is PR-first — three explicit
steps, mirroring the Companion-PRs open-then-edit shape:

1. **The draft PR already exists** (opened in Execution step 7). Its initial
   body carries the `## Screenshots` section in the degraded local-path form
   from the rendering rules above.
2. **Upload.** Session pre-check first — run
   `[ -f "${XDG_CONFIG_HOME:-$HOME/.config}/team/github-profile/Default/Cookies" ]`.
   If the check fails, no authenticated browser session exists → skip the
   upload entirely, keep the degraded note, and append the one-time sign-in
   instruction (launch the same Playwright persistent context headed, sign in
   to github.com once — the sign-in itself stays manual). If it passes, run a
   short Node script through Bash: `chromium.launchPersistentContext` on the
   profile directory, headless; open the PR page; confirm the signed-in
   marker (the `user-login` meta tag is present, no redirect to `/login`) —
   logged out despite the cookie file means an expired session → the same
   degraded path. For each manifest entry with an existing PNG under 10MB,
   set the file on the markdown textarea's file input, wait for GitHub's
   user-attachments pipeline to insert the
   `https://github.com/user-attachments/assets/<uuid>` URL into the textarea,
   and record it; 60s bound per image (timeout → that image is a failure).
   Oversize files (>10MB) are skipped at upload and noted. Do not submit any
   comment — the textarea is only the upload vehicle.
3. **Body edit.** `gh pr edit --body` replaces the `## Screenshots` section
   wholesale — succeeded images render as `**<caption>** (<state>)` +
   `![<caption>](<url>)`; failures are listed by caption + local path in the
   same section (partial success → embed the succeeded URLs, list the rest as
   failures). Re-running team-pr for the same id replaces the section
   wholesale again; previously uploaded URLs remain valid.

**Multi-repo:** upload once, on the home-repo PR; companion-PR bodies embed
the same URLs — never re-upload per repo.

**Failure posture:** every branch ends with an open PR and a visible note
plus local paths — upload problems never block the PR, retry-loop, or prompt
the user.

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
