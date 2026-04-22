---
name: team
description: Full 8-phase autonomous feature implementation pipeline (QRSPI). Trigger on "hey team", "build a feature", "implement end to end", "autonomous implementation", or "/team".
---

# TEAM — Phase-Table Router

You are the TEAM router. You drive a feature from description to shipped
code by walking a linear phase table and dispatching agents. You have **zero
knowledge of what any agent does**. You only know phases, gates, and the
`~/.team/<topic>/state.json` snapshot.

## Input

Feature description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.

## Setup

1. **Check for a beads issue ID.** If the first token of `$ARGUMENTS` matches
   a beads ID pattern (e.g., `team-p3t`, `proj-42a`), use `/beads:show <id>`
   to verify it exists. If valid:
   - Use `/beads:update <id>` to claim and mark the issue as in-progress.
   - Strip the beads ID from the description (use the remainder as the feature
     description). If no remainder, use the issue title from the show output.
   - Set `beadsId` to the matched ID.
   If the first token is not a beads ID, set `beadsId` to `null`.
2. Derive a kebab-case `topic` from the description.
3. Set `today` to the current date (`YYYY-MM-DD`).
4. Create `~/.team/<topic>/` directory if it does not exist.
5. Create `docs/plans/` directory if it does not exist.
6. **Pre-upgrade guard.** If `~/.team/<topic>/` contains any legacy
   append-only event-log file (the previous orchestration substrate) but
   `~/.team/<topic>/state.json` does not exist, stop with: "Detected a
   legacy `.jsonl` append-only event-log file under `~/.team/<topic>/`
   with no `state.json` alongside it. That file is the previous
   orchestration substrate, and this pipeline predates the state.json
   migration. Please delete `~/.team/<topic>/` and restart." Specifically,
   look for a `.jsonl` file under `~/.team/<topic>/` as the legacy signal.
7. If `state.json` exists, load it via `readState(topic)` from `lib/state.mjs`
   and resume from `state.phase`. Else call `initState(topic, beadsId, today)`
   to write a fresh snapshot with `phase: 'QUESTION'`.

The router holds onto the description. Downstream of QUESTION, the
description must NEVER appear in any artifact or payload outside
`task.md` + the questioner's own outputs.

## The Phase Loop

```
loop:
  1. Read state.json. If phase == "SHIPPED" → cleanup and exit.
  2. Look up the phase in the phase table (below) to get the expected
     agent(s) and predecessor artifact path(s).
  3. If predecessor artifacts are missing, raise an error — state.json is
     desynced from disk (user likely deleted artifacts). Suggest
     /team-resume after manual reconciliation.
  4. Dispatch the agent(s) (parallel when the phase table marks them so).
  5. Write each returned artifact to docs/plans/<today>-<topic>-<name>.md.
  6. Run the gate for this phase:
     - HUMAN (design, structure): present the artifact, wait for verdict.
       On approve, touch <artifact>.approved and writeState(topic,
       { phase: <next> }). On reject, increment the revision counter via
       writeState and re-dispatch the same agent with the feedback.
     - MECHANICAL (tests-failing): run the suite; on assertion-only
       failure, writeState(topic, {}) to refresh lastUpdated and advance.
     - ROUTER-EMIT (worktree, PR): router performs the action, then
       writeState(topic, { phase: <next>, ... }).
     - AGGREGATE (5 reviewers): dispatch in parallel, collect results, run
       hard-gate evaluation; on failure increment verificationRetryCount
       via writeState, cap at 5 and escalate.
  7. Update state.json: bump phase (if gate passed), refresh lastUpdated,
     persist any new counters.
  8. Goto loop.
```

### Phase table

| Phase      | Agent(s)                   | Predecessor artifact                                   | Next phase on pass |
|------------|----------------------------|--------------------------------------------------------|--------------------|
| QUESTION   | `questioner`               | (none — description in `$ARGUMENTS`)                   | RESEARCH           |
| RESEARCH   | `file-finder`, `researcher` (parallel) | `docs/plans/<today>-<topic>-task.md`       | DESIGN             |
| DESIGN     | `design-author` (→ human gate)  | `docs/plans/<today>-<topic>-research.md`          | STRUCTURE          |
| STRUCTURE  | `structure-planner` (→ human gate)| `docs/plans/<today>-<topic>-design.md.approved` | PLAN               |
| PLAN       | `planner`                  | `docs/plans/<today>-<topic>-structure.md.approved`     | WORKTREE           |
| WORKTREE   | (router-emit)              | `docs/plans/<today>-<topic>-plan.md`                   | IMPLEMENT          |
| IMPLEMENT  | `test-architect`, `implementer`, 5 reviewers (parallel) | worktree prepared            | PR                 |
| PR         | (router-emit)              | aggregate gate passed                                  | SHIPPED            |

For RESEARCH, dispatch `file-finder` and `researcher` in parallel and
combine their returned content into a single `docs/plans/<today>-<topic>-research.md`
artifact before advancing the phase.

The `skills/team/registry.json` file still lists the 13 agents and their
documented event vocabulary as a reference, but the router no longer
consults it for dispatch — dispatch is driven by the phase table above.

## Blind Research Invariant

The questioner is the only agent that ever sees the raw description from
`$ARGUMENTS`. When dispatching the questioner, pass the full description.
When the questioner returns:

1. Write `task.md`, `questions.md`, `brief.md` to `docs/plans/<today>-<topic>-*.md`
   per the artifact convention. Advance `phase` to `RESEARCH` via
   `writeState(topic, { phase: 'RESEARCH' })`. The artifact paths are not
   persisted into `state.json` — they are derivable from `<today>` and `<topic>`.

When dispatching `file-finder` and `researcher` (which consume the RESEARCH
phase), pass them only `questionsPath` and `briefPath`. They are forbidden
from reading `task.md` and the router must not provide the original
description in their context.

## Gate Handling

### Human Gate (design approval)

When the `design-author` returns a draft:
1. Write `docs/plans/<today>-<topic>-design.md` to disk.
2. Present the design **in full** to the user.
3. Ask: "Do you approve this design?"
4. If approved → `touch docs/plans/<today>-<topic>-design.md.approved`
   (zero-byte sidecar marker — the durable approval artifact), then
   `writeState(topic, { phase: 'STRUCTURE' })`.
5. If rejected → `writeState(topic, { designRevisionCount: <current + 1> })`
   and re-dispatch `design-author` with the user's feedback to produce a new
   draft for re-review. Phase stays `DESIGN`.

### Human Gate (structure approval)

When the `structure-planner` returns a draft:
1. Write `docs/plans/<today>-<topic>-structure.md` to disk.
2. Present the structure **in full** to the user.
3. Ask: "Do you approve this structure?"
4. If approved → `touch docs/plans/<today>-<topic>-structure.md.approved`,
   then `writeState(topic, { phase: 'PLAN' })`.
5. If rejected → `writeState(topic, { structureRevisionCount: <current + 1> })`
   and re-dispatch `structure-planner` with feedback. Phase stays `STRUCTURE`.

### Router-Emit Gate (worktree preparation)

When the plan artifact exists:
1. Use Claude Code's native worktree support to create an isolated worktree
   for this topic.
2. See `skills/worktree-isolation/SKILL.md` for the full methodology.
3. `writeState(topic, { phase: 'IMPLEMENT', worktreePath, branch })`.
   (`worktreePath` and `branch` are optional observability fields.)

### Mechanical Gate (test confirmation)

When the `test-architect` returns failing tests:
1. Run the test suite.
2. If all tests fail with assertion errors (not crashes), advance — call
   `writeState(topic, {})` to refresh `lastUpdated`. Phase remains
   `IMPLEMENT` (the IMPLEMENT phase has multiple internal signals).
3. If tests crash or error, report the issue and stop.

### Aggregate Gate (review collection)

When the 5 reviewers (security, docs, ux, code, verifier) have all returned:
1. Collect all verdicts from the most recent round.
2. Check each hard gate independently:
   - `security-review` — FAIL on any CRITICAL or HIGH findings.
   - `verification` — FAIL if any check failed or no checks detected.
   - `code-review` — FAIL on REQUEST CHANGES verdict.
3. For each failing hard gate, record a typed failure (security, lint,
   typecheck, build, test, review) and increment
   `verificationRetryCount` via `writeState(topic, { verificationRetryCount: <current + 1> })`.
4. If `verificationRetryCount < 5` → dispatch implementer to fix, passing
   the specific failure class(es) so it knows what to address. After
   fixes, all 5 reviewers re-run from scratch.
5. If `verificationRetryCount >= 5` → escalate to the team lead. Present
   all unresolved findings organized by failure type and stop.
6. If all hard gates pass clean → `writeState(topic, { phase: 'PR' })`.

**The loop is: IMPLEMENT → VERIFY (5 reviewers) → typed gate check → IMPLEMENT → VERIFY → ...**
Each round is a complete re-review. Reviewers get fresh context every
round. The implementer receives typed failure classes so it knows exactly
what to fix.

### Router-Emit Gate (PR / ship)

When phase is `PR`:
1. Update `CHANGELOG.md` per `skills/changelog/SKILL.md` (filter for
   user-facing commits since last release).
2. Present shipping options: commit + PR, commit locally, keep as-is.
3. Execute user's choice.
4. If `beadsId` is set in `state.json` and the user chose to commit, use
   `/beads:close <beadsId>` to mark the issue done. Skip if "keep as-is".
5. `writeState(topic, { phase: 'SHIPPED' })`.
6. Delete `~/.team/<topic>/` directory.
7. If a worktree was created, clean it up (cherry-pick/rebase commits
   onto the target branch, then let Claude Code remove the worktree).

## Rules

- `state.json` is the single source of pipeline state; update it via
  `lib/state.mjs` only.
- Approval markers (`.approved` sidecars in `docs/plans/`) are the durable
  record of human gate passes.
- File artifacts in `docs/plans/` are the durable communication protocol.
  Always write phase findings to disk before advancing.
- The two human gates are **design approval** and **structure approval**.
  Never present the plan to the user for approval — the plan is a tactical
  agent artifact, the structure is the human contract.
- The blind-research invariant is non-negotiable. If a researcher's context
  contains the user's original description, the pipeline has a defect.
  Stop and report.
- On any unexpected failure: report to the user and suggest `/team-resume`.
- To add a new agent to the pipeline, add an entry to the phase table and
  a reference in `registry.json`. The `consumes`/`produces` fields in
  `registry.json` are documentation after the state.json migration (see
  the `$comment` in `skills/team/registry.json`).

### Approval marker convention

Human approval creates a zero-byte sidecar file at `<artifact>.approved`
(for example, `docs/plans/<today>-<topic>-design.md.approved`). The
sidecar is the durable signal that downstream phases check to decide
whether the prior human gate has passed.
