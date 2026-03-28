---
name: state-management
description: Pipeline state file format and compaction recovery — loaded by orchestrator and hooks to manage phase transitions, backward retries, and context compaction resilience
---

# State Management

The pipeline state file is the single source of truth for where the pipeline
is in its execution. It survives context compaction, session restarts, and
agent boundaries. Every phase transition and significant step change must be
recorded.

## State File Location

**Path:** `.team/state.json` (gitignored)

This file is ephemeral — it exists only during pipeline execution and is
deleted after the SHIP phase completes. It must never be committed to version
control.

## Schema

```json
{
  "phase": "IMPLEMENT",
  "topic": "feature-name",
  "planPath": "docs/plans/2026-03-28-feature-name-plan.md",
  "researchPath": "docs/plans/2026-03-28-feature-name-research.md",
  "currentStep": "Phase 2 Step 2.1",
  "backwardTransitions": 0,
  "testFiles": [
    "tests/feature-name.test.ts"
  ],
  "startedAt": "2026-03-28T14:30:00Z"
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `phase` | string | Current pipeline phase: `RESEARCH`, `PLAN`, `TEST-FIRST`, `IMPLEMENT`, `VERIFY`, `SHIP` |
| `topic` | string | Hyphenated topic slug matching artifact filenames |
| `planPath` | string | Relative path to the plan artifact |
| `researchPath` | string | Relative path to the research artifact |
| `currentStep` | string | Human-readable description of the current step within the phase |
| `backwardTransitions` | number | Count of times the pipeline has moved backward (max 3) |
| `testFiles` | string[] | Relative paths to acceptance test files created during TEST-FIRST |
| `startedAt` | string | ISO 8601 timestamp of when the pipeline started |

## When to Update

Update the state file at every significant checkpoint:

- **Phase transition** — Whenever the pipeline moves from one phase to the
  next (e.g., PLAN to TEST-FIRST)
- **Step progression** — When completing a step within IMPLEMENT and moving
  to the next step in the plan
- **Backward transition** — When returning to a previous phase after a gate
  failure (increment `backwardTransitions`)
- **Test file creation** — When the test-architect creates acceptance test
  files (append to `testFiles`)

Do NOT update on trivial actions (reading a file, running a grep). The state
file tracks meaningful progress, not activity.

## Phase Transition Protocol

Every phase transition follows this sequence:

1. **Write new phase** — Update `phase` and `currentStep` in the state file
2. **Verify previous artifacts** — Confirm the outgoing phase's artifacts
   exist and are valid (e.g., research file exists, plan file exists, tests
   fail correctly)
3. **Proceed** — Begin work in the new phase

Write-before-verify ensures the state file reflects intent even if
verification reveals a problem. If verification fails, the state file
correctly shows the attempted transition, making recovery straightforward.

## Backward Transitions

When a gate failure forces the pipeline backward (e.g., VERIFY fails, return
to IMPLEMENT):

1. Increment `backwardTransitions`
2. Update `phase` to the target phase
3. Update `currentStep` to describe what needs to be fixed

### Retry Limit

Maximum 3 backward transitions. After the third, the pipeline stops and
escalates to the user with:

- What phase failed
- What gate condition was not met
- What was attempted in each retry
- A recommendation for how the user can unblock the pipeline

Never silently retry beyond the limit. The limit exists because repeated
failures suggest the plan is flawed, not just the implementation.

## Compaction Resilience

Context compaction can erase the orchestrator's working memory at any time.
The state file and two hooks form a three-layer defense:

### Layer 1: State File on Disk

The `.team/state.json` file persists on the filesystem regardless of context
compaction. It is the ground truth.

### Layer 2: PreCompact Anchor Hook

The `pre-compact-anchor.mjs` hook fires before context compaction occurs.
It reads the state file and injects a structured summary into the compacted
context so the orchestrator retains awareness of pipeline position even before
it re-reads the state file.

### Layer 3: SessionStart Recovery Hook

The `session-start-recover.mjs` hook fires when a new session begins (which
happens after compaction). It reads the state file and injects recovery
instructions into the conversation, telling the orchestrator:

- Which phase it was in
- What the current step was
- Where the plan and research artifacts are
- How many backward transitions have occurred

This triple redundancy ensures the pipeline can always resume from its last
checkpoint, even after aggressive context compaction.

## Cleanup

After the SHIP phase completes successfully:

1. Delete `.team/state.json`
2. Delete the `.team/` directory if it is empty

The state file is transient. It serves the pipeline execution and has no value
after the feature ships. Plan and research artifacts in `docs/plans/` are the
permanent record.
