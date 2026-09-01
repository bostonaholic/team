---
name: team-fix
description: |
  Compressed bug-fix pipeline — reproduce, write failing test, minimal fix,
  verify, and open a draft PR. Skips Question/Research/Design/Structure/Plan
  phases. Invoke ONLY on explicit pipeline intent — the user says "run the
  bug-fix pipeline", "team-fix this bug", or runs "/team-fix". The pipeline
  moves the tracker ticket, commits, pushes a branch, and opens a draft PR
  without stopping to ask: never infer pipeline intent from a plain request
  to fix a bug — that asks for an inline fix, not this pipeline.
effort: high
argument-hint: "<ticket id, issue URL, or bug description>"
---

# Team Fix — Bug Fix Pipeline

Run the compressed bug-fix pipeline. Goes straight to test-driven fix
discipline without the full QRSPI ceremony.

Invocation is guarded per `skills/principle-explicit-intent/SKILL.md`: the
pipeline fires only on stated pipeline intent — a plain "fix this bug" asks
for an inline fix, not this pipeline.

## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — set aside as `ticketId` on
  `task.md`.
- An issue URL — fetched through `gh issue view` to extract title and body.
- Free-form text — treated as the bug description.

When `$ARGUMENTS` is empty, **discover, do not demand**: ground in repo
context before asking. Read recent `git log` activity and the repo's
`README` / `CLAUDE.md` to surface the likely failing area, then use
`AskUserQuestion` with labeled options to fill any genuine gap. Never
bare-stop with a plain "describe the bug" demand when context is available.

## When to Use

Use `/team-fix` when:

- The bug is well-understood and the affected code is known
- The fix is likely contained to a small number of files
- No architectural decisions are needed — this is a defect correction

Use `/team` (full QRSPI pipeline) when:

- The root cause is unknown and needs investigation
- The fix requires designing new behavior or APIs
- Multiple subsystems may be involved
- The user wants to align on the approach before code is written

## Pipeline

```
WORKTREE → REPRODUCE → RED (failing test) → GREEN (minimal fix) → VERIFY → SHIP
```

No Question. No Research. No Design. No Structure. No Plan. No approval gate.

## Setup

1. **Resolve the input** to a bug description first. On empty `$ARGUMENTS`,
   ground in repo context, then ask only for genuine gaps, per the
   **"discover, do not demand"** rule in `## Input`. A ticket id or issue
   URL is resolved as `## Input` describes (`gh issue view` for URLs).
2. **Move the ticket to in-progress.** If the input resolved to a ticket id
   or issue, move that ticket to its tracker's in-progress state — this is
   the first action of the fix, before any other work begins. Call the Skill
   tool with `tracking-tickets` and
   follow its ticket-lifecycle rules, best-effort —
   skip silently when no tracker mechanism exists. Never block the pipeline
   on a tracker update.
3. **Derive `<id>`** the same way `/team` does (ticket-prefixed or
   date-prefixed kebab slug).
4. **Run the WORKTREE phase** (`## Worktree` below) before anything else
   touches the working tree. It settles which branch the fix commits to, so
   it must finish before the artifact directory is authored.
5. **Create `docs/plans/<id>/`** inside the resolved worktree, and write a
   minimal `docs/plans/<id>/task.md` with the standard frontmatter
   (`topic`, `date`, `phase: task`, `ticketId`) plus a brief description
   of the bug. The `topic` value is the kebab portion of `<id>` — i.e.
   `<id>` minus the `<TICKET>-` or `<YYYY-MM-DD>-` prefix. Never use the
   ticket id, the date, or a re-worded description as the topic.
   `ticketId` lives only on `task.md`. This is the single durable record
   for the fix and lets any `/team-*` command pick it up if interrupted.
6. **Seed the TodoWrite ledger** with the bug-fix phases:
   `Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`.
   Mark `Worktree` as `in_progress`.
   See `skills/principle-progress-tracking/SKILL.md` for the per-step tracking convention agents follow within each phase.

## Worktree

This is the **leading** phase, and the one hard gate in the pipeline. A fix
never commits to the default branch. Everything after this phase runs in the
checkout this phase resolves.

### Branch gate

Run this block first. It prints `on-default` when HEAD is the repository's
default branch, and `ok <branch>` otherwise:

```sh
# Branch gate — a fix never commits to the default branch.
default="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)"
default="${default#origin/}"
if [ -z "$default" ]; then
  # No origin/HEAD (no remote, or an unset remote head): fall back to whichever
  # conventional default-branch name actually exists locally.
  for candidate in main master; do
    if git show-ref --verify --quiet "refs/heads/$candidate"; then
      default="$candidate"; break
    fi
  done
fi
head="$(git rev-parse --abbrev-ref HEAD)"
if [ -n "$default" ] && [ "$head" = "$default" ]; then
  echo "on-default"
else
  echo "ok $head"
fi
```

- **`ok <branch>`** — HEAD is already on a non-default branch. Reuse it in
  place. Create no worktree and no new branch, and announce the reuse once:
  "Continuing on branch `<branch>`." This is also the linked-worktree reuse
  case in `skills/team-worktree/SKILL.md` → "Detect existing worktree".
- **`on-default`** — isolate before the first commit, per **Isolate** below.

### Isolate

Create the home worktree on branch `<id>` off `origin/HEAD`, exactly as
`/team`'s leading WORKTREE phase does. Call the Skill tool with
`team-worktree` for the single-repo
"Create the worktree(s)" procedure, and with `worktree-isolation` for the topology:

```sh
git fetch origin --quiet
git worktree add .claude/worktrees/<id> -b <id> origin/HEAD
```

Then continue the fix inside that worktree.

**Edge — branch `<id>` already exists** (re-invocation): reuse the worktree
that holds it. Do not recreate either one.

**Edge — worktree creation fails**, on a shallow clone, certain CI systems,
or permissions. Isolation is best-effort; **the branch is not.** Report the
failure loudly, then branch in place and keep going:

```sh
git switch -c <id>
```

Re-run the branch gate afterward. It must print `ok <id>`. If the run cannot
get off the default branch at all, stop and report — that is the one
condition that aborts before any work, because the alternative is committing
a fix to the default branch.

## Execution

Call the Skill tool with `test-driven-bug-fix` before proceeding, and follow that
methodology.

When the failure is non-obvious, call the Skill tool with
`systematic-debugging` and drill its
**Root Cause Analysis (5 Whys)** causal chain to the root before proposing a
fix. The fix lands at the root, never at the symptom, per
`skills/principle-fix-root-causes/SKILL.md`.

When the buggy behavior looks deliberate — a guard, a threshold, a
workaround, anything an author plausibly wrote on purpose — call the
Skill tool with `why` on that code before changing it. A "bug" that was a
deliberate trade-off needs its constraint preserved, not deleted; the
rationale findings become inputs to the minimal fix.

Mark each TodoWrite item `in_progress` when you begin and `completed`
when it finishes.

**Mechanical gate between Red and Green:** the new test must fail with an
assertion failure, not a crash, and the project's static checks (typecheck,
lint, build) must pass. Do not proceed to the fix until both are confirmed. A
runner that executes tests without type-checking them leaves a red type checker
behind a green suite.

## Ship

1. Commit in two commits:
   - `test:` commit with the failing test
   - `fix:` commit with the minimal fix
2. **Open a draft PR automatically — do not stop to ask.** The WORKTREE
   phase already put the run on a non-default branch, so push that branch
   and open the PR as a **draft** (`gh pr create --draft`). Re-assert the
   branch gate first — `git rev-parse --abbrev-ref HEAD` must not name the
   default branch. If it does, push nothing and report: the commits are
   local and recoverable, a push to the default branch is not.
3. **Ticket — link now, in-review when ready.** If `ticketId` is non-null in
   `task.md`'s frontmatter, call the Skill tool with `tracking-tickets` and
   apply its ticket-lifecycle rules: link the PR to the ticket through the
   conditional closing footer, keep the ticket in-progress while the PR is a
   draft and move it to in-review only once the PR is marked ready for
   review, and never close the ticket by hand — the link auto-closes it on
   merge. Best-effort. Never block. Surface the `ticketId` in the completion
   report.
4. Mark all TodoWrite items complete.

## Aborting

If reproduction fails: report "Bug could not be reproduced with the
given description." and stop. Do not write a test for an unconfirmed bug.

If the fix is larger than expected (touching many files, requiring new
APIs, or revealing an architectural problem): stop, report the scope,
and recommend switching to the full `/team` pipeline.
