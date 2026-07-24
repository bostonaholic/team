---
name: pr-watch
description: |
  Arm a bounded watch loop on a pull request: undraft it, take a baseline
  snapshot, then poll GitHub every ~30 minutes for up to 24 hours and
  triage new review feedback as it arrives. Stops on approval, merge,
  close, timeout, user interrupt, or repeated poll failures; on approval
  it hands off to /shipit and never runs it. Trigger on
  "the PR is ready for review", "watch the PR",
  "watch this PR and fix comments", or "/pr-watch".
effort: medium
argument-hint: "[<pr-number-or-url>]"
---

# pr-watch — bounded PR review watch loop

> Follow `skills/progress-tracking/SKILL.md`: this procedure has more than two steps —
> seed one todo item per step below before starting and mark each complete as you go.

`pr-watch` closes the gap between "PR open" and "ship it". It promotes the
PR out of draft, takes a baseline snapshot, and polls GitHub on a bounded
cycle. When new review feedback arrives, it runs the triage procedure in
`skills/pr-open-comments/SKILL.md`. The session stays dedicated to the
watch while it is armed — that trade-off is accepted by design. The user
can interrupt at any time, and each individual command stays small and
observable.

## Input

Resolve the PR from `$ARGUMENTS` (a PR number or a full PR URL) or from
the current branch (`gh pr view`). Refuse up front, before any other work:

- If no PR resolves from the current branch or the argument, fail fast
  with a clear message.
- If the PR state is MERGED or CLOSED, refuse to arm — there is nothing to
  watch.
- If the argument is a malformed PR number or URL, report it — do not
  guess.

## Execution

### 1. Arm

- If the PR is a draft, run `gh pr ready` to promote it, and report the
  promotion loudly — the user must see that the draft went public.
- If `gh pr ready` fails (for example, permissions), warn and keep
  watching — the promotion is not a precondition for the loop.
- Apply the best-effort in-review ticket transition per
  `skills/tracking-tickets/SKILL.md` — a tracker call never blocks the
  watch.
- Take a baseline snapshot: the unresolved review-thread ids, the
  issue-comment timestamps, `state`, and `reviewDecision`.
- If the PR is already approved at arm time, report it and run one
  final triage pass over any still-unresolved threads — no loop.
- A second arm in the same session replaces the previous baseline. There
  is no cross-session state — after a restart, re-arm by saying so.

### 2. Bounded cycle mechanics

The loop is bounded, never infinite:

- **Cycle 0 polls immediately** — feedback that already exists at arm time
  is triaged at once.
- Each later cycle is up to three `sleep 600` Bash calls plus one short
  poll call (~31 minutes per cycle).
- **Hard cap: 48 cycles** (~24 hours). At the cycle-48 timeout, report the
  timeout and offer to re-arm.
- The bound is the invariant, not the magic number: the per-call Bash
  timeout must be at least as long as each individual call. If the
  environment caps the timeout lower, shorten the sleeps and add calls.

### 3. Poll and change detection

Each poll is one Bash call that combines:

- `gh pr view --json state,reviewDecision,isDraft`
- a trimmed GraphQL `reviewThreads` query — thread ids and `isResolved`
  only
- the issue-comment timestamps

Print a one-line snapshot per poll so progress stays observable without
flooding the transcript. A change is any of:

- the unresolved-thread set differs from the last triaged set
- a new issue-level comment or review body appeared
- `state` or `reviewDecision` changed

A single transient poll failure is not a stop — retry on the next cycle.
After 3 consecutive poll failures, stop and name the error (an expired
`gh` token surfaces through this path) — never spin silently.

### 4. On new feedback — run the triage procedure

When a poll detects a change, load `skills/pr-open-comments/SKILL.md` and
follow it. This skill never restates the triage steps — the fetch,
verification, and punch-list format live there.

The loop runs in one of two modes. The mode is granted per arming
instruction and holds for the life of the watch: a plain arm ("watch the
PR") selects the default present-then-stop mode; an arming instruction
that grants authorization ("watch this PR and fix comments") selects
authorized mode. Every loop report — the poll snapshot and the batch
report — names the active mode, so the mode stays auditable. A timeout
re-arm keeps the mode.

The default mode is present-then-stop:

- Present the punch list, then stop the turn — a turn must end to collect
  the user's per-item choices.
- After the user's choices execute, offer to re-arm the watch.

### Authorized mode — apply, resolve, resume

When the arming instruction grants authorization, each feedback batch
runs the Authorized Execution path of
`skills/pr-open-comments/SKILL.md`: apply → push → 🤖 reply → resolve.
Then the loop re-arms until approval, merge, or timeout.

- If a batch contains carve-out items (declined, needs-clarification, or
  could-not-apply), apply the authorized items first, then present the
  carve-outs and stop the loop — never watch past an open disagreement.
- If a push fails in authorized mode, stop the loop and report it. Never
  reply "done" or resolve a thread without landed code.

### 5. Edge cases

- If a wake finds zero unresolved threads and no other change (for
  example, a reviewer resolved their own thread), re-arm silently and
  present nothing.
- If a CHANGES_REQUESTED review arrives with an empty body and no threads,
  there is no verifiable ask to triage. Emit a status line that names the
  reviewer and the requested-changes state, treat it as a
  needs-clarification carve-out, and stop the loop — suggest that the user
  ask the reviewer what they want. Watching past it would hide a blocking
  signal.

### 6. Stop conditions

The loop stops on:

- **Approval** — run the hand-off in step 7.
- **Merge or close** — the PR reached a terminal state; report it.
- **User interrupt** — the escape hatch; the user can stop the watch at
  any time.
- **Cycle-48 timeout** — report the timeout and offer to re-arm.
- **3 consecutive poll failures** — stop and name the error.

### 7. On approval — hand off, never land

Never auto-run `/shipit` — the merge decision belongs to the user. When
the PR is approved:

1. Report the approval.
2. Run one final triage pass over any still-unresolved threads.
3. End with the handoff: `Next: run /shipit when you want to land it.`

### Compaction defense

All loop state is re-fetchable from GitHub. After a compaction, re-derive
the baseline: fetch the current unresolved-thread ids, the issue-comment
timestamps, `state`, and `reviewDecision`, then continue polling from the
snapshot lines already in the transcript.

## Completion

Report:

- the stop reason (approval, merge, close, user interrupt, cycle-48
  timeout, or 3 consecutive poll failures)
- the active mode (present-then-stop or authorized)
- the number of cycles consumed
- the handoff — on approval, `Next: run /shipit when you want to land
  it.`; on timeout or after the user's choices execute, offer to re-arm
  the watch.
