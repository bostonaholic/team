# TEAM Architecture

> **Task Execution Agent Mesh** -- A Claude Code plugin that orchestrates
> specialized agents to autonomously implement entire features end-to-end,
> driven by an append-only event log and the QRSPI methodology.

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
- **Blind research.** The researcher and file-finder never receive the
  user's original task description. Enforcement has two layers:
  *structural* — the `task.captured` event payload and every downstream
  event omit the description, and the blind agents' frontmatter consume
  `task.captured` rather than `feature.requested`; *procedural* — the
  blind agents' system prompts forbid reading `task.md`. A PreToolUse
  hook could upgrade the procedural layer to structural.
- **Two human touchpoints.** Design approval (~200-line alignment doc) and
  Structure approval (~2-page vertical-slice breakdown). The Plan is not
  human-gated — humans review the structure, which is the real contract.
- **Hooks enforce discipline mechanically.** LLMs forget instructions ~20%
  of the time; hooks are deterministic.

## 2. Event Store

**File:** `.team/<topic>/events.jsonl` (append-only JSONL, gitignored)

Each line is a self-contained event:

```json
{
  "seq": 1,
  "event": "feature.requested",
  "producer": "router",
  "ts": "2026-04-20T14:30:00Z",
  "data": { "description": "add user auth", "topic": "add-user-auth", "today": "2026-04-20" },
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
- During live pipeline runs, the router is the **only writer** to the event log.
  (Dev tools like `demo.mjs` also write to the log for demonstration purposes.)
- Current pipeline state is **derived** by scanning the log for the latest
  event of each type.
- The `description` field from `feature.requested` must NEVER appear in any
  downstream event payload. The questioner is the only agent that reads it.

## 3. Pipeline (QRSPI)

The pipeline has eight phases, expressed as event flow:

```
feature.requested
    │
    v
 questioner
    │
    v
 task.captured  ────────────────────────┐
    │                                    │
    ├──> file-finder ──> files.found ───┤
    │                                    │
    └──> researcher ────────────────────>├──> research.completed
                                         │
                                    design-author
                                         │
                                    design.drafted
                                         │
                                  [HUMAN GATE]
                                  /            \
                           approved           rejected
                              │                  │
                     design.approved  design.revision-requested
                              │                  │
                              v                  └──> design-author
                        structure-planner
                              │
                        structure.drafted
                              │
                       [HUMAN GATE]
                      /              \
                approved           rejected
                   │                  │
          structure.approved  structure.revision-requested
                   │                  │
                   v                  └──> structure-planner
                planner
                   │
              plan.drafted
                   │
              [ROUTER-EMIT]
                   │
           worktree.prepared
                   │
                   v
            test-architect
                   │
             tests.written
                   │
           [MECHANICAL GATE]
                   │
         tests.confirmed-failing
                   │
                   v
             implementer
             │         │
      slice.completed  ...
             │
    implementation.completed
             │
  ┌──────┬──────┼──────┬──────┐
  v      v      v      v      v
 code  security docs   ux   verifier
 -rev. -rev.    -writer -rev.
  │      │      │      │      │
  └──────┴──────┴──────┴──────┘
             │
    [AGGREGATE GATE]
   /                \
 all pass      hard gate fails
  │                  │
verification.passed  hard-gate.*-failed
  │             (typed per failure)
[ROUTER-EMIT]     └──> implementer (retry)
  │
feature.shipped
```

### Phase 1: Question

**Trigger:** `feature.requested`
**Agent:** `questioner`
**Output event:** `task.captured`
**Artifacts:** `docs/plans/YYYY-MM-DD-<topic>-{task,questions,brief}.md`

Decomposes the user's intent into three artifacts. Only the questioner ever
sees the user's description.

### Phase 2: Research (blind)

**Trigger:** `task.captured`
**Parallel agents:** `file-finder`, `researcher` (both BLIND to task.md)
**Join:** Router waits for `files.found`, then merges with researcher output
**Output event:** `research.completed`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-research.md`

### Phase 3: Design

**Trigger:** `research.completed`
**Agent:** `design-author` (MUST ask open questions interactively before drafting)
**Output events:** `design.drafted`
**Gate:** HUMAN — `design.approved` or `design.revision-requested`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-design.md`

### Phase 4: Structure

**Trigger:** `design.approved`
**Agent:** `structure-planner`
**Output events:** `structure.drafted`
**Gate:** HUMAN — `structure.approved` or `structure.revision-requested`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-structure.md`

Breaks the approved design into vertical slices with per-slice acceptance
tests.

### Phase 5: Plan

**Trigger:** `structure.approved`
**Agent:** `planner`
**Output event:** `plan.drafted`
**Artifact:** `docs/plans/YYYY-MM-DD-<topic>-plan.md`

No human gate — humans reviewed the structure; the plan is tactical.

### Phase 6: Worktree

**Trigger:** `plan.drafted`
**Producer:** router (no agent)
**Output event:** `worktree.prepared`
**Artifact:** isolated git worktree under `.claude/worktrees/<topic>/`

### Phase 7: Implement

**Trigger:** `worktree.prepared`
**Sequential sub-agents:**
1. `test-architect` → `tests.written`
2. Mechanical gate → `tests.confirmed-failing`
3. `implementer` → `slice.completed` (per slice) → `implementation.completed`
4. 5 parallel reviewers → `review.completed`, `security-review.completed`,
   `docs-review.completed`, `ux-review.completed`, `verification.completed`
5. Aggregate gate → `verification.passed` or typed `hard-gate.*-failed`

**Progress events:** `slice.completed` (one per vertical slice, with
per-slice commit sha)
**Pass event:** `verification.passed`
**Fail events:** `hard-gate.security-failed`, `hard-gate.lint-failed`,
`hard-gate.typecheck-failed`, `hard-gate.build-failed`, `hard-gate.test-failed`,
`hard-gate.review-failed` (loops to implementer, max 5 rounds)

### Phase 8: PR

**Trigger:** `verification.passed`
**Producer:** router (no agent)
**Output event:** `feature.shipped`
**Actions:** update CHANGELOG, commit + open PR (or commit locally / leave
uncommitted per user choice), close beads issue if present, delete
`~/.team/<topic>/`, clean up worktree

## 4. Agent Roster

| Agent              | Model   | Mode        | Tools                              | Consumes                           | Produces                    |
|--------------------|---------|-------------|------------------------------------|------------------------------------|------------------------------|
| `questioner`       | sonnet  | acceptEdits | Read, Write, Grep, Glob            | `feature.requested`                | `task.captured`              |
| `file-finder`      | haiku   | plan        | Read, Grep, Glob                   | `task.captured` (blind)            | `files.found`                |
| `researcher`       | sonnet  | plan        | Read, Grep, Glob                   | `task.captured` (blind)            | `research.completed`         |
| `design-author`    | opus    | acceptEdits | Read, Write, Edit, Grep, Glob      | `research.completed`, `design.revision-requested` | `design.drafted` |
| `structure-planner`| opus    | acceptEdits | Read, Write, Edit, Grep, Glob      | `design.approved`, `structure.revision-requested` | `structure.drafted` |
| `planner`          | opus    | acceptEdits | Read, Write, Edit, Grep, Glob      | `structure.approved`               | `plan.drafted`               |
| `test-architect`   | inherit | acceptEdits | Read, Write, Edit, Grep, Glob, Bash| `worktree.prepared`                | `tests.written`              |
| `implementer`      | opus    | acceptEdits | Read, Write, Edit, Grep, Glob, Bash| `tests.confirmed-failing`, `hard-gate.*-failed` | `implementation.completed` |
| `code-reviewer`    | sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `review.completed`           |
| `security-reviewer`| sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `security-review.completed`  |
| `technical-writer` | sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `docs-review.completed`      |
| `ux-reviewer`      | sonnet  | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `ux-review.completed`        |
| `verifier`         | haiku   | plan        | Read, Grep, Glob, Bash             | `implementation.completed`         | `verification.completed`     |

**Model tiering:** haiku for mechanical tasks, sonnet for judgment, opus for
design + structure + planning + implementation.

## 5. Thin Router

The `team` skill implements a pure event loop:

```
loop:
  1. Read .team/<topic>/events.jsonl
  2. Determine current state from latest events
  3. Consult registry.json for agents that consume the latest event(s)
  4. Check gate conditions (if any triggered)
  5. Dispatch eligible agent(s) — parallel if marked
  6. Record output event(s) to the log
  7. If terminal event (feature.shipped) → exit
  8. If human gate → pause and prompt user
  9. If router-emit gate → perform the action, emit passEvent
 10. Goto loop
```

**The router has no agent-specific logic.** It does not know what a
`questioner` does or what a `planner` produces. It only knows:

- Which events have occurred (from the log)
- Which agents subscribe to those events (from the registry)
- Which gates apply (from the registry)
- Whether gate conditions are met (from event payloads)

To add, remove, or reorder agents, edit `registry.json`. The router requires
no changes.

## 6. Skills

### Entry Points (slash commands)

| Skill            | Command                    | Description                              |
|------------------|----------------------------|------------------------------------------|
| `team`           | `/team <desc>`             | Full 8-phase QRSPI pipeline              |
| `team-fix`       | `/team-fix <bug>`          | Compressed bug-fix pipeline              |
| `team-question`  | `/team-question <desc>`    | Decompose intent (runs alone)            |
| `team-research`  | `/team-research`           | Blind research (runs Question if missing)|
| `team-design`    | `/team-design`             | Design alignment (human gate)            |
| `team-structure` | `/team-structure`          | Vertical-slice structure (human gate)    |
| `team-plan`      | `/team-plan`               | Tactical plan from approved structure    |
| `team-worktree`  | `/team-worktree`           | Prepare isolated worktree                |
| `team-implement` | `/team-implement`          | Test-first + slice exec + 5-reviewer     |
| `team-pr`        | `/team-pr`                 | Commit + PR                              |
| `team-resume`    | `/team-resume`             | Replay event log, resume from last state |

Each partial skill works by scanning the event log for the required
prerequisite events and either resuming from that point or running the
prerequisite phases first.

### Methodology (loaded by agents, not directly invoked)

| Skill                    | Description                                    | Consumers                                                    |
|--------------------------|------------------------------------------------|--------------------------------------------------------------|
| `qrspi-workflow`         | Phase discipline, artifact conventions, gates  | Loaded by router/orchestrator skills                         |
| `test-first-development` | Acceptance tests as scope fence                | Loaded by test-architect, orchestrator                       |
| `adversarial-review`     | Generator-evaluator separation, review method  | Loaded by code-reviewer, security-reviewer, ux-reviewer, technical-writer |
| `engineering-standards`  | Engineering standards, implementation methodology, quality checklist | Loaded by planner, implementer, code-reviewer |
| `refactoring-to-patterns`| Code smells and safe refactoring procedures    | Loaded by implementer                                        |
| `solid-principles`       | SOLID design principles                        | Loaded by implementer, code-reviewer                         |
| `systematic-debugging`   | Root cause investigation                       | Loaded by agents when debugging                              |
| `documenting-decisions`  | ADR creation and management                    | Loaded by design-author, structure-planner                   |
| `writing-prose`          | Clear documentation and readable explanation   | Loaded by technical-writer                                   |
| `worktree-isolation`     | Worktree setup + cleanup                       | Loaded by router during Worktree phase                       |

### Design Guidelines

1. **Methodology skill load limit:** Soft limit of 3 methodology skills per
   agent invocation. At ~143 lines average per skill, 3 skills add ~430 lines
   (~6K-10K tokens, under 6% of 200K context). A fourth skill signals the
   agent's responsibility may be too broad. This is a design convention, not a
   hard constraint.

2. **Extraction threshold:** Extract methodology to a separate skill file when
   it forms a coherent, independently maintainable body of knowledge --
   regardless of consumer count. Extraction is justified by swappability,
   independent versioning, and file size (inlining would meaningfully grow the
   consuming file). Do not require 2+ consumers as a prerequisite. The
   threshold is about cohesion and maintainability, not reuse count.

## 7. Hooks

| Hook                       | Event                    | Purpose                                    |
|----------------------------|--------------------------|--------------------------------------------|
| `pre-bash-guard.mjs`       | PreToolUse(Bash)         | Block dangerous commands                   |
| `pre-compact-anchor.mjs`   | PreCompact               | Snapshot latest event seq before compaction |
| `session-start-recover.mjs`| SessionStart             | Replay event log to recover pipeline state |
| `post-write-validate.mjs`  | PostToolUse(Write\|Edit) | Validate plugin structure                  |

## 8. Shared Event Library

**File:** `lib/events.mjs`

Canonical location for event parsing logic shared across hooks and the
Teamflow dashboard. Exports:

- `EVENT_TO_PHASE` — maps event names to pipeline phases (QUESTION, RESEARCH,
  DESIGN, STRUCTURE, PLAN, WORKTREE, IMPLEMENT, PR, SHIPPED)
- `deriveState(events)` — derives current pipeline state from an event array
- `readEventLog(dir)` — reads and parses `.team/<topic>/events.jsonl`
- `projectDir()` — resolves the project root directory
- `sessionDir(topic)` — resolves the per-topic session directory under `~/.team/<topic>/`

Both `session-start-recover.mjs` and `pre-compact-anchor.mjs` import from
this library rather than duplicating event logic.

### Teamflow State Engine

**File:** `teamflow/src/state.ts`

The Teamflow dashboard maintains its own state engine that extends the shared
event library with richer tracking. It reads `skills/team/registry.json` at
startup to build agent and gate configuration, then derives per-agent status,
per-gate status, and timeline entries from each event via `applyEvent()`.

Shared types live in `teamflow/src/types.ts` (`AgentStatus`, `GateStatus`,
`TimelineEntry`, `RunState`) and are imported by both the server-side state
engine and Svelte client components.

Gate status is derived from registry gates and joins:

- **human** — design approval (DESIGN phase), structure approval (STRUCTURE phase)
- **mechanical** — test confirmation gate (IMPLEMENT phase)
- **aggregate** — review collection gate (IMPLEMENT phase)
- **router-emit** — worktree preparation (WORKTREE phase), PR/ship (PR phase)
- **join** — parallel research agent fan-in (RESEARCH phase)

Each gate transitions through `pending → waiting → passed/failed` as events
arrive. Gate keys, phases, and labels are derived from `registry.json` and
`EVENT_TO_PHASE` — no hardcoded mapping.

The client tracks a `hasEverConnected` flag (set on first SSE snapshot, never
reset) to distinguish initial connection from mid-session disconnects. When
not yet connected or when connected with no phase and no events, the
`EmptyState` component replaces `PhaseCards` and `Timeline`.

## 9. State Management

**Primary state:** `.team/<topic>/events.jsonl` (append-only event log)

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
