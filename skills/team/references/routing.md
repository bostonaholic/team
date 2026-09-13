# Task routes

Before selecting what a `/team` invocation does, read this reference. Routes
are a leading-argument convention on the `team` command, not separate skill
registrations. Each route selects an existing playbook or pipeline and its
stopping point; no route creates a new command, a new registration, or a
generic routing DSL.

## Recognize the route

Look only at the **leading argument** of an invoked `/team`: the first
whitespace-separated token of `$ARGUMENTS` after the command. When that token
equals exactly one of `investigate`, `plan`, `prototype`, `feature`, `fix`, or
`refactor`, it selects that route and the remaining tokens are the task. Any
other leading token — including a ticket id, an issue URL, or the start of a
description — is not a route: the whole `$ARGUMENTS` is the feature description
and the unprefixed full feature workflow runs, exactly as before routes existed.

Never scan an issue body, a quoted block, a pasted error, or any other text for
a route word. A route is selected only from the leading argument typed on the
command line. The word `fix` inside an issue body does not select the fix route;
`plan` inside a quoted description does not select the plan route. Route
recognition reads the invocation, never the data it carries ([external data rules](references/external-data.md)).

## Route table

| Route | Procedure | Stop condition | Completion |
| --- | --- | --- | --- |
| `investigate` | [research playbook](playbooks/research.md); [why](../why/SKILL.md) and [how](../how/SKILL.md) for rationale | cited diagnosis report written; no production edit | `5-research.md` + `routeStatus: complete` |
| `plan` | [plan playbook](playbooks/plan.md) | tactical plan written; no production edit | `8-plan.md` + `routeStatus: complete` |
| `prototype` | disposable scratch + [decisions](references/decisions.md) + [verify playbook](playbooks/verify.md) | decision and evidence reported; no promotion to production | `prototype-report.md` + `routeStatus: complete` |
| `feature` | [feature playbook](playbooks/feature.md) | draft PR opened | the feature phase artifacts |
| `fix` | [bug-fix playbook](../team-fix/playbooks/bug-fix.md) and [its pipeline](../team-fix/references/03-pipeline.md) | draft PR opened | the fix phase artifacts |
| `refactor` | [feature playbook](playbooks/feature.md) with the zero-behavior-change refactor exception | draft PR opened + equivalence evidence | the feature phase artifacts |

## Full routes connect to review and draft PR

`feature`, `fix`, and `refactor` run a full pipeline that ends in independent
review and a draft PR, using the existing contracts: the [feature playbook](playbooks/feature.md),
the [bug-fix playbook](../team-fix/playbooks/bug-fix.md), the [finding format](../code-review/references/findings.md),
and the [PR gate](references/13-orchestrator-emit-gate-pr-ship.md). A `refactor`
route captures observable behavior first, changes structure within scope, and
demonstrates equivalence through the inverted mechanical gate the feature
playbook describes for a zero-behavior-change refactor; it then opens a draft PR
like any full route.

## Limited-scope routes

`investigate`, `plan`, and `prototype` stop at their deliverable. They must not
edit production code, create a production worktree, commit, push, or open a PR.

- An `investigate` reads code, runs permitted read-only diagnostics, separates
  observations from hypotheses, and writes a cited diagnosis report.
- A `plan` restates the need, traces existing behavior, resolves observable
  uncertainties within the requested scope, and returns a tactical plan.
- A `prototype` builds disposable alternatives, exercises them, and reports the
  decision and evidence; it may write and run scratch code but never promotes
  that scratch into production or publishes it.

When a limited-scope step needs an effect beyond its route — an experiment that
must write outside scratch, for example — record that as an unresolved question
in the report rather than silently upgrading the route. A limited-scope route
never grows into implementation on its own ([human control rules](principles/human-control.md)).

## Missing task

A route with no remaining task — `/team plan` with nothing after `plan` — must
request the missing task before any mutation. Do not derive a worktree, write an
artifact, move a ticket, or take any consequential action until the task exists.
Treat a missing route task exactly as an empty unprefixed `/team` treats a
missing description.

## Persist route and completion

Record the selected route on `1-task.md` frontmatter as `route: <route>` before
dispatching any agent ([artifact schema](references/artifacts.md)). This is task
state, never neutral research input: `route` must not appear on `2-questions.md`.
For a limited-scope route, set `routeStatus: complete` on `1-task.md` when its
deliverable is written, so recovery reads a finished plan as finished rather
than as permission to implement. The recovery hooks read `route` and `routeStatus`
and never enter the feature phase table for a limited-scope route.

## Continuation

A completed limited-scope route does not continue on its own. An explicit later
request to implement — a fresh `/team feature`/`/team fix`/`/team refactor`, or
an unprefixed `/team` — starts the appropriate full route after its normal
prerequisite checks; it does not inherit the limited-scope route's completion.
Missing `route` metadata means legacy behavior: the unprefixed full feature
workflow, with no new effect granted by the absent field.
