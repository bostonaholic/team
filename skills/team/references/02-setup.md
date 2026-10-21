## Setup

0. **Select the route first** per [routing](routing.md), before authoring any
   worktree or artifact. Only a full route (`feature`, `fix`, `refactor`, or
   unprefixed) runs the leading WORKTREE phase; a limited-scope route writes
   in place under the home `docs/plans/<id>/` and stops at its deliverable.
1. **Resolve `$ARGUMENTS`** (after routing, its remaining task tokens) to a
   description:
   - Ticket identifier (e.g. `ENG-1234`): look it up in the tracker.
   - Issue URL (e.g. `https://github.com/org/repo/issues/42`): extract the
     title and body with `gh issue view`.
   - Free-form text: use as-is.

   If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.
2. **Capture `ticketId`**: if `$ARGUMENTS` starts with a ticket-like pattern
   (e.g. `<system>-<id>`), it is `ticketId` (the `<id>` prefix and
   `1-task.md`'s `ticketId`); otherwise `null`.
3. **Move the ticket to in-progress** as the run's first action when steps
   1–2 resolved a `ticketId` or issue, per the ticket-lifecycle rules in
   [tracking rules](../team-pr/references/tracking.md). Best-effort: skip
   silently with no tracker mechanism; never block on it.
4. **Derive `<id>`:** choose a 2–4 word `<kebab-topic>` from the
   description, then run
   `<team-skill-dir>/scripts/plan-id.sh [--ticket <ticketId>] <kebab-topic>`,
   where `<team-skill-dir>` is the absolute directory containing this
   installed `SKILL.md`. Its `id=` line is `<id>`. Exit 2: fix the topic or
   ticket its stderr names and rerun.
5. **Seed the TodoWrite ledger** with one item per phase, in order:
   `Worktree → Question → Research → Design → Structure → Plan → Implement → Code review → Security review → PR`,
   with `Worktree` `in_progress` ([execution rules](references/execution.md)).
   With no TodoWrite, use the Rules reference's substitute file ledger. The
   home worktree and `docs/plans/<id>/` are created at WORKTREE, not here.
6. **Resolve the canonical artifact directory.** If `git worktree list` shows
   a worktree whose basename is `<id>` (the `.claude/worktrees/<id>`
   convention), it is `<worktree-path>/docs/plans/<id>/`; otherwise the
   in-place home `docs/plans/<id>/`. Use it for resume detection and the rest
   of the session, threading its absolute path into every downstream dispatch.
7. **Resume detection.** If artifacts for `<id>` exist there, fast-forward the
   ledger, marking completed each phase whose artifacts are present, except:
   - DESIGN is complete only when
     `<team-skill-dir>/scripts/design-review-status.sh <artifact-dir>` exits 0.
     A `6-design.md` with no passing review resumes **at the review step**,
     never a re-draft; ignore `approved` fields from older runs.
   - IMPLEMENT is complete only by "IMPLEMENT complete" ("Branch state" in the
     [artifact schema](references/artifacts.md)).
   - CODE REVIEW is complete only when the newest `review-<n>.md` is PASS and
     current per that schema. Otherwise, with IMPLEMENT complete, resume at
     CODE REVIEW.
   - SECURITY REVIEW is complete only when CODE REVIEW is complete and the
     newest `security-review-<n>.md` is PASS and current. Otherwise, with CODE
     REVIEW complete, resume at SECURITY REVIEW. A SECURITY REVIEW fix commit
     leaves the `review-<n>.md` record stale, so that run resumes at CODE
     REVIEW.
   - Resume never re-dispatches `test-architect` or `implementer`.

   Then mark the first incomplete phase `in_progress`. **Never re-dispatch a
   phase whose artifact already exists** (re-running QUESTION overwrites
   `1-task.md`). Already-done is done, never an error
   ([durable state rules](principles/durable-state.md)).

**Research-isolation invariant.** You hold the description in your own
context. Downstream of QUESTION it must NEVER appear in any artifact or agent
payload outside `1-task.md` and the questioner's own outputs.
