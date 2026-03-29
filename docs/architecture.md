# TEAM Architecture

> **Task Execution Agent Mesh** -- A Claude Code plugin that orchestrates
> specialized agents to autonomously implement entire features end-to-end,
> driven by an append-only event log.

## 1. Design Philosophy

Agents are **decoupled microservices**. Each agent consumes events, does work,
and produces events. No agent knows about any other agent. The pipeline
emerges from event flow, not from orchestrator logic.

The `team` skill is a **thin event router**. It reads the event log, consults
`registry.json` to find the next agent(s) to dispatch, records their output
events, and checks gates. It contains zero agent-specific knowledge.

**Principles:**

- **Events are the source of truth.** State is derived from the event log,
  never stored directly. Replay the log to reconstruct any point in time.
- **Registry defines wiring.** `skills/team/registry.json` is the single
  source of truth for which agent consumes which event. Change the pipeline
  by editing the registry, not the router.
- **File artifacts survive compaction.** Agents communicate through file
  artifacts in `docs/plans/`. These survive context window compaction and
  can be re-read by any agent in any session.
- **Single human gate.** Plan approval is the only point requiring user
  interaction. Everything else is autonomous with mechanical gates.
- **Hooks enforce discipline mechanically.** LLMs forget instructions ~20%
  of the time; hooks are deterministic.

## 2. Event Store

**File:** `.team/events.jsonl` (append-only JSONL, gitignored)

Each line is a self-contained event:

```json
{
  "seq": 1,
  "event": "feature.requested",
  "producer": "router",
  "ts": "2026-03-28T14:30:00Z",
  "data": { "description": "add user auth", "topic": "add-user-auth", "today": "2026-03-28" },
  "artifact": null,
  "causedBy": null,
  "gate": null
}
```

| Field      | Type          | Description                                       |
|------------|---------------|---------------------------------------------------|
| `seq`      | integer       | Monotonically increasing, assigned by router       |
| `event`    | string        | Event name from the [event catalog](event-catalog.md) |
| `producer` | string        | Agent name or `router`                             |
| `ts`       | ISO-8601      | When the event was recorded                        |
| `data`     | object        | Event-specific payload                             |
| `artifact` | string\|null  | Path to file artifact, if produced                 |
| `causedBy` | integer\|null | `seq` of the triggering event                      |
| `gate`     | object\|null  | Gate result metadata                               |

**Invariants:**

- Events are **append-only**. Never modify or delete a line.
- `seq` values are **gapless** and **monotonically increasing**.
- The router is the **only writer** to the event log.
- Current pipeline state is **derived** by scanning the log for the latest
  event of each type.

## 3. Pipeline

The pipeline has six phases, expressed as event flow:

```
feature.requested
    ├──> file-finder ──> files.found ─────────────┐
    └──> researcher ──────────────────────────────>├──> research.completed
                                                   │
                                      [openQuestions > 0?]
                                         yes │          no │
                                             v             │
                                      product-owner        │
                                             │             │
                                      ambiguity.resolved   │
                                             │             │
                                             v             v
                                          planner ──> plan.drafted
                                                          │
                                                    plan-critic
                                                          │
                                                    plan.critiqued
                                                          │
                                                   [HUMAN GATE]
                                                  /             \
                                          approved             rejected
                                             │                    │
                                       plan.approved    plan.revision-requested
                                             │                    │
                                             v                    └──> planner
                                       test-architect
                                             │
                                       tests.written
                                             │
                                      [MECHANICAL GATE]
                                             │
                                   tests.confirmed-failing
                                             │
                                        implementer
                                        │         │
                                 step.completed  ...
                                        │
                                implementation.completed
                                        │
                  ┌─────────┬───────────┼───────────┬─────────────┐
                  v         v           v           v             v
            code-reviewer  security  technical   ux-reviewer  verifier
                  │       -reviewer    -writer       │            │
                  v         v           v            v            v
            review     security-    docs-review  ux-review  verification
           .completed  review       .completed   .completed  .completed
                  │    .completed       │            │            │
                  └─────────┴───────────┴────────────┴────────────┘
                                        │
                                 reviews.aggregated
                                        │
                                [AGGREGATE GATE]
                               /                \
                       all pass              hard gate fails
                          │                       │
                   verification.passed     hard-gate.failed
                          │                       │
                   feature.shipped          └──> implementer (retry)
```

### Phase 1: Research

**Trigger:** `feature.requested`
**Parallel agents:** `file-finder`, `researcher`
**Join:** Router waits for `files.found`, then merges with researcher output
**Output event:** `research.completed`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-research.md`

### Phase 2: Plan

**Trigger:** `research.completed` (or `ambiguity.resolved` if questions exist)
**Conditional agent:** `product-owner` (if `openQuestions > 0`)
**Sequential agents:** `planner`, then `plan-critic`
**Output events:** `plan.drafted`, `plan.critiqued`
**Gate:** Human approval -- `plan.approved` or `plan.revision-requested`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-plan.md`

### Phase 3: Test-First

**Trigger:** `plan.approved`
**Agent:** `test-architect`
**Output event:** `tests.written`
**Gate:** Mechanical -- all tests must fail with assertion errors, not crashes
**Pass event:** `tests.confirmed-failing`

### Phase 4: Implement

**Trigger:** `tests.confirmed-failing` (or `hard-gate.failed` on retry)
**Agent:** `implementer`
**Progress events:** `step.completed` (per plan step)
**Output event:** `implementation.completed` (when all tests pass)

### Phase 5: Verify

**Trigger:** `implementation.completed`
**Parallel agents:** `code-reviewer`, `security-reviewer`, `technical-writer`,
`ux-reviewer`, `verifier`
**Aggregation event:** `reviews.aggregated`
**Gate:** Aggregate -- hard gates on `security-review.completed` and
`verification.completed`
**Pass event:** `verification.passed`
**Fail event:** `hard-gate.failed` (loops to implementer, max 3 retries)

### Phase 6: Ship

**Trigger:** `verification.passed`
**Output event:** `feature.shipped`
**Cleanup:** Router deletes `.team/` directory after recording terminal event

## 4. Agent Roster

| Agent              | Model   | Mode        | Tools                              | Consumes                           | Produces                    |
|--------------------|---------|-------------|------------------------------------|------------------------------------|------------------------------|
| `file-finder`      | haiku   | plan        | Read, Grep, Glob                   | `feature.requested`                | `files.found`                |
| `researcher`       | sonnet  | plan        | Read, Grep, Glob                   | `feature.requested`                | `research.completed`         |
| `product-owner`    | sonnet  | plan        | Read, Grep, Glob                   | `research.completed`               | `ambiguity.resolved`         |
| `planner`          | opus    | acceptEdits | Read, Write, Edit, Grep, Glob      | `research.completed`, `ambiguity.resolved`, `plan.revision-requested` | `plan.drafted` |
| `plan-critic`      | sonnet  | plan        | Read, Grep, Glob                   | `plan.drafted`                     | `plan.critiqued`             |
| `test-architect`   | inherit | acceptEdits | Read, Write, Edit, Grep, Glob, Bash| `plan.approved`                    | `tests.written`              |
| `implementer`      | opus    | acceptEdits | Read, Write, Edit, Grep, Glob, Bash| `tests.confirmed-failing`          | `implementation.completed`   |
| `code-reviewer`    | sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `review.completed`           |
| `security-reviewer`| sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `security-review.completed`  |
| `technical-writer` | sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `docs-review.completed`      |
| `ux-reviewer`      | sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `ux-review.completed`        |
| `verifier`         | haiku   | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `verification.completed`     |

**Model tiering:** haiku for mechanical tasks, sonnet for judgment, opus for
planning and implementation.

## 5. Thin Router

The `team` skill implements a pure event loop:

```
loop:
  1. Read .team/events.jsonl
  2. Determine current state from latest events
  3. Consult registry.json for agents that consume the latest event(s)
  4. Check gate conditions (if any triggered)
  5. Dispatch eligible agent(s) — parallel if marked
  6. Record output event(s) to the log
  7. If terminal event (feature.shipped) → exit
  8. If human gate → pause and prompt user
  9. Goto loop
```

**The router has no agent-specific logic.** It does not know what a
`file-finder` does or what a `planner` produces. It only knows:

- Which events have occurred (from the log)
- Which agents subscribe to those events (from the registry)
- Which gates apply (from the registry)
- Whether gate conditions are met (from event payloads)

To add, remove, or reorder agents, edit `registry.json`. The router requires
no changes.

## 6. Skills

### Entry Points (slash commands)

| Skill            | Command                 | Description                              |
|------------------|-------------------------|------------------------------------------|
| `team-brainstorm`| `/team-brainstorm <idea>` | Optional pre-research brainstorming    |
| `team`           | `/team <desc>`          | Full pipeline -- emit `feature.requested` |
| `team-fix`       | `/team-fix <bug>`       | Compressed bug-fix pipeline (no research/plan) |
| `team-research`  | `/team-research <desc>` | Emit `feature.requested`, stop after `research.completed` |
| `team-plan`      | `/team-plan <desc>`     | Resume or start from `research.completed` |
| `team-test`      | `/team-test`            | Resume from `plan.approved`              |
| `team-implement` | `/team-implement`       | Resume from `tests.confirmed-failing`    |
| `team-verify`    | `/team-verify`          | Resume from `implementation.completed`   |
| `team-ship`      | `/team-ship`            | Resume from `verification.passed`        |
| `team-resume`    | `/team-resume`          | Replay event log, resume from last state |

Each partial skill works by scanning the event log for the required
prerequisite events and either resuming from that point or running the
prerequisite phases first.

### Methodology (loaded by agents, not directly invoked)

| Skill                    | Description                                    |
|--------------------------|------------------------------------------------|
| `rpi-workflow`           | Phase discipline, artifact conventions, gates  |
| `test-first-development` | Acceptance tests as scope fence                |
| `adversarial-review`     | Generator-evaluator separation, review method  |
| `systematic-debugging`   | Root cause investigation                       |
| `documenting-decisions`  | ADR creation and management                    |

## 7. Hooks

| Hook                       | Event                    | Purpose                                    |
|----------------------------|--------------------------|--------------------------------------------|
| `pre-bash-guard.mjs`      | PreToolUse(Bash)         | Block dangerous commands                   |
| `pre-compact-anchor.mjs`  | PreCompact               | Snapshot latest event seq before compaction |
| `session-start-recover.mjs`| SessionStart            | Replay event log to recover pipeline state |
| `post-write-validate.mjs` | PostToolUse(Write\|Edit) | Validate plugin structure                  |

## 8. State Management

**Primary state:** `.team/events.jsonl` (append-only event log)

State is never stored directly. It is always derived by replaying the event
log. To determine the current phase, scan for the latest event and consult
the registry for what comes next.

**Compaction defense (three layers):**

1. **Event log on disk** -- survives everything. The log is the ground truth.
2. **PreCompact hook** -- injects the latest event sequence number and current
   phase into the compacted context, so the router can resume without
   re-reading the entire log.
3. **SessionStart hook** -- replays the event log on session start to
   reconstruct the pipeline position.

**Artifact persistence:** File artifacts in `docs/plans/` are committed to
git and survive across sessions, compaction events, and context resets. They
are the durable communication protocol between agents.
