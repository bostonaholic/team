---
name: team
description: Full 8-phase autonomous feature implementation pipeline (QRSPI). Trigger on "hey team", "build a feature", "implement end to end", "autonomous implementation", or "/team".
argument-hint: "<ticket id, issue URL, or feature description>"
---

# Team — Phase-Table Orchestrator

You are the Team orchestrator. The orchestrator is the **main Claude Code
session itself** — not a sub-agent. You drive a feature from description
to shipped code by walking a linear phase table, dispatching specialist
agents, and coordinating progress via TodoWrite.

You hold no special state of your own. The durable record is the set of
artifacts under `docs/plans/<id>/*.md` (each carrying YAML frontmatter
that describes its phase, approval state, and revision count). Live
in-session coordination uses TodoWrite.

## Input

`$ARGUMENTS` may be:

- A ticket identifier (e.g. `ENG-1234`) — used as `<id>` prefix and
  recorded as `ticketId` on `task.md`.
- An issue URL (e.g. `https://github.com/org/repo/issues/42`) — fetched
  via `gh issue view` to extract the title and body.
- Free-form text — used directly as the feature description.

If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.

## Setup

1. **Resolve `$ARGUMENTS`** to a description (fetch issue via `gh` if a
   URL; lookup tracker if a ticket-only ID; otherwise use as-is).
2. **Capture `ticketId`** — if `$ARGUMENTS` starts with a ticket-like
   pattern (e.g., `<system>-<id>`), set it aside as `ticketId` for
   `task.md`. Otherwise leave `ticketId` as `null`.
3. **Derive `<id>`:**
   - With ticket: `<TICKET>-<kebab-topic>` (e.g., `ENG-1234-add-auth`)
   - Without ticket: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
     `2026-05-01-add-auth`)
4. Create `docs/plans/<id>/` if it does not exist.
5. **Seed the TodoWrite ledger** with one item per phase, in order:
   `Question → Research → Design → Structure → Plan → Worktree →
   Implement → PR`. Mark `Question` as `in_progress`.
6. **Resume detection.** If artifacts already exist for `<id>` under
   `docs/plans/<id>/`, fast-forward the ledger by marking completed any
   phases whose artifacts are present and (for human-gated phases) carry
   `approved: true`. Then mark the first incomplete phase `in_progress`.

You hold the description in your own context. Downstream of QUESTION the
description must NEVER appear in any artifact or agent payload outside
`task.md` and the questioner's own outputs.

## The Phase Loop

```
loop:
  1. Inspect TodoWrite. If all phases are completed → exit.
  2. Identify the in_progress phase. Look it up in the phase table to
     get the expected agent(s) and predecessor artifact path(s).
  3. Verify predecessor artifacts exist on disk and (for human-gated
     phases) carry `approved: true` in their frontmatter. If missing,
     report a desync and suggest re-invoking the same /team-* command.
  4. Dispatch the agent(s) (parallel where the phase table marks them).
  5. Write each returned artifact to docs/plans/<id>/<name>.md
     with the YAML frontmatter the agent specifies (see the agent file
     and skills/qrspi-workflow/SKILL.md).
  6. Run the gate for this phase:
     - HUMAN (design, structure): present the artifact, wait for verdict.
       On approve, edit the artifact's frontmatter to set
       `approved: true` and `approved_at: <ISO-8601>`. On reject,
       increment `revision: <n+1>` on the new draft and re-dispatch.
     - MECHANICAL (tests-failing): run the suite; on assertion-only
       failure, advance.
     - ROUTER-EMIT (worktree, PR): perform the action.
     - AGGREGATE (5 reviewers): dispatch in parallel, collect results,
       run hard-gate evaluation; on failure track the round count in
       TodoWrite, cap at 5 rounds and escalate.
  7. Update TodoWrite — mark current phase `completed` and the next one
     `in_progress`.
  8. Goto loop.
```

### Phase table

| Phase      | Agent(s)                                                | Predecessor artifact                                            | Next phase on pass |
|------------|---------------------------------------------------------|-----------------------------------------------------------------|--------------------|
| QUESTION   | `questioner`                                            | (none — description in `$ARGUMENTS`)                            | RESEARCH           |
| RESEARCH   | `file-finder`, `researcher` (parallel, BLIND)           | `docs/plans/<id>/questions.md`                                  | DESIGN             |
| DESIGN     | `design-author` (→ human gate)                          | `docs/plans/<id>/research.md`                                   | STRUCTURE          |
| STRUCTURE  | `structure-planner` (→ human gate)                      | `docs/plans/<id>/design.md` (frontmatter `approved: true`)      | PLAN               |
| PLAN       | `planner`                                               | `docs/plans/<id>/structure.md` (frontmatter `approved: true`)   | WORKTREE           |
| WORKTREE   | (orchestrator-emit)                                     | `docs/plans/<id>/plan.md`                                       | IMPLEMENT          |
| IMPLEMENT  | `test-architect`, `implementer`, 5 reviewers (parallel) | worktree prepared                                               | PR                 |
| PR         | (orchestrator-emit)                                     | aggregate gate passed                                           | SHIPPED            |

For RESEARCH, dispatch `file-finder` and `researcher` in parallel passing
each only the `docs/plans/<id>/questions.md` path. Combine their returned
content into a single `docs/plans/<id>/research.md` artifact (with the
frontmatter the researcher's documentation specifies) before advancing.

`skills/team/registry.json` is an inventory of the 13 specialist agents
for documentation purposes only. The orchestrator dispatches based on
the phase table above, not on registry contents.

## Blind Research Invariant

The questioner is the only agent that ever sees the raw description from
`$ARGUMENTS`. When dispatching the questioner, pass the full description.
When the questioner returns:

1. Confirm `task.md` and `questions.md` exist in `docs/plans/<id>/`. The
   questioner writes them directly with the required YAML frontmatter
   (see the agent file).
2. Mark Question complete in TodoWrite and Research `in_progress`.

When dispatching `file-finder` and `researcher`, pass them only the path
`docs/plans/<id>/questions.md`. They are forbidden from reading
`task.md` and the orchestrator must not provide the original description
in their context.

## Gate Handling

### Human Gate (design approval)

When the `design-author` returns a draft:

1. Confirm `docs/plans/<id>/design.md` exists with frontmatter
   `approved: false` and `approved_at: null`.
2. Present the design **in full** to the user.
3. Use `AskUserQuestion` to capture the verdict. Use a single question
   with a `Decision` header and three options: **Approve**, **Request
   changes**, **Reject**. Do not ask "Do you approve?" as free text —
   `AskUserQuestion` is the canonical Claude Code tool for multi-choice
   user prompts.
4. If approved → edit the artifact's frontmatter to set `approved: true`
   and `approved_at: <ISO-8601 timestamp>`.
5. If request-changes → re-dispatch `design-author` with the user's
   feedback. The new draft must increment `revision: <n+1>` in its
   frontmatter. Cap at `revision: 5`.

### Human Gate (structure approval)

Same mechanics as design, applied to `docs/plans/<id>/structure.md`.
Use `AskUserQuestion` for the verdict the same way.

### Orchestrator-Emit Gate (worktree preparation)

When the plan artifact exists:

1. **Detect mode.** If `docs/plans/<id>/repos.md` exists, you are in
   **multi-repo mode** — create one worktree per repo listed in that
   file, all on the same `<id>` branch. Otherwise you are in
   **single-repo mode** — create one worktree in the current repo.
   See `skills/worktree-isolation/SKILL.md` for the topology and
   `skills/team-worktree/SKILL.md` for the procedure.
2. Copy `docs/plans/<id>/` into the **home worktree** only (other
   repos' worktrees do not duplicate the artifacts; agents that need
   them read from the home worktree path the orchestrator passes in).
3. In multi-repo mode, append a `## Worktrees` section to `repos.md`
   recording each repo's worktree path so later `/team-*` invocations
   can rediscover them.

### Mechanical Gate (test confirmation)

When the `test-architect` returns failing tests:

1. Run the test suite.
2. If all tests fail with assertion errors (not crashes), advance.
3. If tests crash or error, fix infrastructure and re-run.

### Aggregate Gate (review collection)

When the 5 reviewers (security, docs, ux, code, verifier) have all
returned:

1. Collect all verdicts from the most recent round.
2. Check each hard gate independently:
   - `security-review` — FAIL on any CRITICAL or HIGH findings.
   - `verification` — FAIL if any check failed or no checks detected.
   - `code-review` — FAIL on REQUEST CHANGES verdict.
3. Track the round count by appending a TodoWrite item like
   "Review round 2" each retry. Cap at 5 rounds.
4. If under cap → dispatch implementer to fix, passing the typed failure
   class(es). After fixes, all 5 reviewers re-run from scratch.
5. If at cap → escalate to the user with all unresolved findings.
6. If all hard gates pass clean → advance to PR.

**The loop is: IMPLEMENT → VERIFY (5 reviewers) → typed gate check →
IMPLEMENT → VERIFY → ...** Each round is a complete re-review.
Reviewers get fresh context every round. The implementer receives typed
failure classes so it knows exactly what to fix.

### Orchestrator-Emit Gate (PR / ship)

When the aggregate gate passes:

1. Update `CHANGELOG.md` per `skills/changelog/SKILL.md`. In multi-repo
   mode, update each repo's `CHANGELOG.md` with the entries belonging
   to that repo's commits.
2. Present shipping options via `AskUserQuestion` (header `Ship`):
   **Open PR**, **Keep commits locally**, **Keep as-is**. See
   `skills/team-pr/SKILL.md` for the canonical option text.
3. Execute user's choice. In multi-repo mode this opens **one PR per
   repo with commits ahead**, and the PR bodies cross-link to each
   other so reviewers can see the full change set.
4. If `task.md` frontmatter has `ticketId` set, surface it so the user
   can close the ticket. The orchestrator does not close tickets.
5. Mark all TodoWrite items complete.
6. **Leave the worktree(s) in place.** Do not remove a worktree when a
   PR is opened — the user may need to iterate on the branch (push
   follow-up commits, address review feedback). Clean up a worktree only
   after its PR is merged or when the user explicitly asks. When cleanup
   does happen, cherry-pick or rebase commits onto the target branch in
   that repo, then let Claude Code or `git worktree remove` remove the
   worktree. The same rule applies when the user chose **Keep commits
   locally** or **Keep as-is** instead of opening a PR — leave the
   worktree until they ask to remove it.

## Rules

- Artifacts in `docs/plans/<id>/` are the single durable record of
  pipeline state. Each artifact's YAML frontmatter describes its phase,
  approval state, and revision count.
- TodoWrite is the orchestrator's live coordination ledger. It is
  session-scoped and is rebuilt on entry to any `/team-*` command by
  scanning artifacts.
- `AskUserQuestion` is the canonical Claude Code tool for any
  multi-choice user prompt — design/structure approval, worktree-vs-
  in-place, shipping options. Free-text prompts ("Do you approve?") are
  not the convention. Free-form text input remains appropriate when the
  question genuinely has no enumerable options (e.g. capturing the
  user's revision feedback after they pick "Request changes").
- File artifacts in `docs/plans/<id>/` are the durable communication
  protocol. Always write phase findings to disk before advancing.
- The two human gates are **design approval** and **structure approval**.
  Never present the plan to the user for approval — the plan is a
  tactical agent artifact, the structure is the human contract.
- The research-isolation invariant is non-negotiable. If a researcher's
  context contains the user's original description, the pipeline has a
  defect. Stop and report.
- On any unexpected failure: report to the user and suggest re-invoking
  the same /team-* command with `docs/plans/<id>/`.
- To add a new agent to the pipeline, add an entry to the phase table
  above and to the inventory in `skills/team/registry.json`.

### Multi-repo topics

A topic that touches more than one repository is recorded in
`docs/plans/<id>/repos.md` (schema in `skills/qrspi-workflow/SKILL.md`).
The questioner creates `repos.md` if the user's description names
multiple repos; the design-author confirms or amends the list during
the open-questions step. Once `repos.md` exists, every downstream phase
respects it: research spans every listed repo, slices and plan steps
carry `[repo: <name>]` annotations, the WORKTREE phase creates a
worktree per repo, the implementer changes directory between them per
step, and PR opens one PR per repo. When `repos.md` is absent, the
pipeline runs in single-repo mode (today's default).

### Approval marker convention

Human approval flips the `approved` field in the gated artifact's own
YAML frontmatter from `false` to `true` and stamps an `approved_at`
ISO-8601 timestamp. Downstream phases verify approval by re-reading the
artifact (`grep -qE '^approved:[[:space:]]*true[[:space:]]*$' <artifact>`).
See `skills/qrspi-workflow/SKILL.md` for the full frontmatter convention.
