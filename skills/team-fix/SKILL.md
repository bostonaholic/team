---
name: team-fix
description: |
  Run the compressed autonomous bug-fix pipeline: isolate, reproduce, add a
  failing test, fix the root cause, verify, commit, push, and open a draft PR.
  Trigger only on "run the
  bug-fix pipeline", "team-fix this bug", or "/team-fix"; a plain request to
  fix code does not authorize branch, tracker,
  push, or PR mutations.
effort: high
argument-hint: "<ticket id, issue URL, or bug description>"
---

# Team Fix

Run this compressed pipeline only:

```text
WORKTREE -> REPRODUCE -> RED -> GREEN -> VERIFY -> DRAFT PR
```

## Setup

Resolve the ticket, issue URL, or text to a bug description and optional
`ticketId`. Empty input grounds in repository context, then asks only for the
missing bug description.

When `ticketId` exists, call the Skill tool with `tracking-tickets` and move it
to in-progress, best-effort, before any branch or worktree mutation.

Derive the same ticket/date-prefixed `<id>` as Team. Inspect the current branch:

- Reuse a non-default branch only when it has no open PR or its PR is for this
  bug.
- A default branch or unrelated PR requires a new `<id>` worktree.

Call the Skill tool with `team-worktree` from the appropriate home checkout,
passing only the explicit planned `docs/plans/<id>/` path as `$ARGUMENTS`. Use
the canonical artifact directory and non-default checkout it returns. Stop if
isolation cannot leave the default branch.

In the canonical directory, write `1-task.md` from the captured setup values.
Use the canonical schema with the topic, date, `phase: task`, captured
`ticketId`, `workflow: team-fix`, and the full resolved bug description
unchanged under `## Request`. Re-read the artifact and verify its frontmatter
and full request. Stop if an existing valid task records different intent.

Follow `skills/principle-progress-tracking/SKILL.md`.
Apply `skills/principle-explicit-intent/SKILL.md` and
`skills/principle-fix-root-causes/SKILL.md`.
Seed the TodoWrite ledger with the six pipeline stages.

## Fix

1. Call the Skill tool with `test-driven-bug-fix` and reproduce the defect before changing code.
   If reproduction fails, stop: do not invent a failing test.
2. When the cause is unclear, call the Skill tool with `systematic-debugging`.
   When suspicious code appears deliberate, call the Skill tool with `why`
   before changing it. Fix the root cause, not the symptom.
3. Add one acceptance test. Confirm RED is an assertion failure, not a crash,
   while the mechanical gate's static checks, including typecheck when
   available, pass.
4. Commit the failing test as `test:`. Implement the smallest fix, run focused
   and full checks, then commit it as `fix:`. Both commits must be signed and
   verified.
5. If the work expands into new APIs, architecture, or multiple subsystems,
   stop and recommend the full Team pipeline.
6. After verification, call the Skill tool with `artifact-frontmatter`, then
   write `9-implementation.md` with PASS, the current home HEAD, and any deferred
   review notes. Use the same contract for `10-pr.md`.

## Draft PR

Recheck that HEAD is not the default branch. Push, open a draft PR, and write
`10-pr.md`; never merge. Pass the body through a file, not interpolated shell.
When `ticketId` exists, call the Skill tool with `tracking-tickets`: add the
`Closes #<ticket>` footer, keep the ticket in progress while draft, and move it
to in-review only when ready. This update is best-effort and never blocks.

Report the draft URL, commit SHA, ticket ID when present, and artifact path.
