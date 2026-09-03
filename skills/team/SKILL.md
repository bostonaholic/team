---
name: team
description: |
  Run Team's autonomous eight-phase feature pipeline. Trigger on "hey team",
  "build this end to end", "resume the Team run", or "/team". It creates a
  branch, commits, pushes, opens draft pull requests, and updates a tracker, so
  never infer this pipeline from a plain request to edit code.
effort: medium
argument-hint: "<ticket|URL|description> | resume <id> [--only <phase>]"
---

# Team

You are the sole QRSPI coordinator. Durable state is the artifact set; TodoWrite
is only the current session's view.
Follow `skills/principle-progress-tracking/SKILL.md` for every ledger below.
Apply `skills/principle-deep-agents-narrow-seams/SKILL.md`,
`skills/principle-fail-closed/SKILL.md`,
`skills/principle-files-are-the-contract/SKILL.md`, and
`skills/principle-idempotent-reruns/SKILL.md`.
Call the Skill tool with `qrspi-workflow` and `artifact-frontmatter` before
parsing input.

```text
WORKTREE -> QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> IMPLEMENT -> PR
```

## Parse input

Send the raw argument string on stdin to
`node "<skill-dir>/scripts/parse-input.mjs"`. Stop before mutation on a nonzero
exit; otherwise use its structured result. It accepts exactly two forms:

```text
/team <ticket id, issue URL, or feature description>
/team resume <id> [--only <worktree|question|research|design|structure|plan|implement|pr>]
```

`--only` is valid only after `resume <id>` and takes one phase. Reject missing,
unknown, repeated, or extra arguments before mutation. An empty start asks for
the feature description and stops.

## Start

1. Resolve the ticket/URL/free text to one description. Capture `ticketId` or
   `null`; issue URLs are read through `gh issue view`.
2. When `ticketId` exists, call the Skill tool with `tracking-tickets` and move
   it to in-progress, best-effort. This is the run's first mutation.
3. Derive `<id>` as `<TICKET>-<2-4-word-kebab-topic>` or
   `<YYYY-MM-DD>-<2-4-word-kebab-topic>`.
4. Query that exact ID with `node "<skill-dir>/scripts/phase-state.mjs" resolve`.
   Exit 3 means a new run.
   A returned WORKTREE phase is an interrupted start: reuse it and let steps
   6-8 persist the supplied request. Any later phase reports `/team resume <id>`
   and stops. Every other failure stops.
5. Seed the TodoWrite ledger with eight items in the phase order below.
6. Call the Skill tool with `team-worktree`. Pass only the planned absolute
   `docs/plans/<id>/` path as `$ARGUMENTS`. Use the canonical path it returns.
7. In the canonical directory, write `1-task.md` from the captured start values.
   Use the canonical schema with the topic, date, `phase: task`, captured
   `ticketId`, `workflow: team`, and the full resolved request unchanged under
   `## Request`.
8. Re-read `1-task.md` and verify its frontmatter and full request. This is the
   durable start record and WORKTREE postcondition; do not mark the phase
   complete or advertise a resume command until it passes. Do not keep a
   second state file.
9. Continue with the phase loop at QUESTION.

## Resume

Run `node "<skill-dir>/scripts/phase-state.mjs" resolve <repo-root> <id>` after
validating `<id>` against that script's ID pattern. It resolves only that ID
across the invoking checkout and its git worktrees. A missing or malformed ID
is an error; never choose the newest topic.

Resume requires the durable request in a valid `1-task.md`. A resolved WORKTREE
phase means Start did not finish recording it: stop, report the interrupted
start, and ask for `/team <original request>`. No phase may reconstruct a
missing request from the topic ID.

Rebuild TodoWrite from the returned phase. Mark earlier phases complete and the
returned phase in progress. `COMPLETE` reports `10-pr.md` and stops.

With `--only`, run
`node "<skill-dir>/scripts/phase-state.mjs" select <artifact-dir> <phase>` and
obey its `action`:

- `noop`: report the already-complete phase and stop;
- `blocked`: refuse the phase named after the first incomplete phase; or
- `run`: execute it once, verify its postcondition, and stop without dispatching
  the successor.

## Phase loop

Call the Skill tool with the applicable one of `team-worktree`,
`team-question`, `team-research`, `team-design`, `team-structure`, `team-plan`,
`team-implement`, and `team-pr`.

| Phase | Internal skill | Required completion |
| --- | --- | --- |
| WORKTREE | `team-worktree` | `1-task.md` |
| QUESTION | `team-question` | `2-questions.md` |
| RESEARCH | `team-research` | `5-research.md` |
| DESIGN | `team-design` | latest passing `design-review-<n>.md` |
| STRUCTURE | `team-structure` | `7-structure.md` |
| PLAN | `team-plan` | `8-plan.md` |
| IMPLEMENT | `team-implement` | current-head `9-implementation.md` |
| PR | `team-pr` | current-head `10-pr.md` |

For the in-progress phase:

1. Pass only the canonical absolute artifact directory as `$ARGUMENTS` to its
   internal skill. Phase-specific context comes from predecessor artifacts.
2. Require the module's completion signal. On failure, keep the phase in
   progress and report the exact artifact directory plus
   `/team resume <id>`.
3. Before STRUCTURE on both fresh and resumed runs, call the Skill tool with
   `team-worktree` with the same directory when `4-repos.md` declares secondary
   repositories. It idempotently creates missing worktrees and records every
   path before STRUCTURE consumes the design.
4. Mark the phase complete. If `--only` was supplied, stop. Otherwise mark the
   next phase in progress and continue in the same turn.

Never copy a module's procedure into this file. Use the loaded workflow for
phase gates, the loaded artifact contract for schemas, and the named module for
execution.

## Invariants

- Research dispatch receives only `2-questions.md` and optional `4-repos.md`, never
  request text or `1-task.md`.
- Subagents resolve open questions as recorded assumptions; no mid-run human
  prompt or approval gate.
- DESIGN fails closed until its latest review passes.
- IMPLEMENT loops automatically until Blocking and Major findings are gone.
  Its PASS record is invalid when any recorded HEAD changes.
- `team-implement` returns before PR. The coordinator separately invokes
  `team-pr`, which performs only the PR phase.
- Multi-repo mode comes from `4-repos.md`; every secondary path passes the
  sibling containment check before worktree creation.
- Opening draft PRs is terminal. Merging belongs to `shipit` and is never part
  of this pipeline.
On success, report all draft URLs, final commit SHAs, ticket ID when present,
and the canonical artifact directory.
