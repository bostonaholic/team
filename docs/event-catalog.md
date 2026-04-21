# Event Catalog

> Every state change in the TEAM pipeline is an event. This catalog is the
> definitive reference for all QRSPI events, their schemas, and their
> relationships. The pipeline runs through eight phases:
> Question → Research → Design → Structure → Plan → Worktree → Implement → PR.

## Event Envelope

Every event in `.team/<topic>/events.jsonl` follows this envelope:

```json
{
  "seq": 1,
  "event": "feature.requested",
  "producer": "router",
  "ts": "2026-04-20T14:30:00Z",
  "data": {},
  "artifact": null,
  "causedBy": null,
  "gate": null
}
```

| Field      | Type          | Description                                       |
|------------|---------------|---------------------------------------------------|
| `seq`      | integer       | Monotonically increasing sequence number           |
| `event`    | string        | Event name from this catalog                       |
| `producer` | string        | Agent or `router` that emitted the event           |
| `ts`       | ISO-8601      | Timestamp of emission                              |
| `data`     | object        | Event-specific payload (see schemas below)         |
| `artifact` | string\|null  | Path to file artifact produced, if any             |
| `causedBy` | integer\|null | `seq` of the event that triggered this one         |
| `gate`     | object\|null  | Gate metadata when event represents a gate result  |

## Blind-Research Invariant

The `description` field from `feature.requested` MUST NEVER appear in any
downstream event payload. The `questioner` is the only agent that ever reads
it. From `task.captured` onward, every payload uses path references
(`taskPath`, `questionsPath`, `briefPath`) instead of the description itself,
and `researcher`/`file-finder` are forbidden from reading `task.md`.

## Event Flow

```
feature.requested
    │
    v
 questioner ─> task.captured
                │
                ├──> file-finder ─> files.found ─┐
                └──> researcher ─────────────────┴─> research.completed
                                                        │
                                                  design-author
                                                        │
                                                  design.drafted
                                                        │
                                                [HUMAN GATE]
                                                /            \
                                          approved        rejected
                                              │              │
                                     design.approved  design.revision-requested
                                              │              │
                                              v              └─> design-author
                                       structure-planner
                                              │
                                       structure.drafted
                                              │
                                       [HUMAN GATE]
                                       /            \
                                  approved        rejected
                                     │               │
                          structure.approved  structure.revision-requested
                                     │               │
                                     v               └─> structure-planner
                                  planner ─> plan.drafted
                                                  │
                                          [ROUTER-EMIT]
                                                  │
                                          worktree.prepared
                                                  │
                                                  v
                                            test-architect ─> tests.written
                                                                  │
                                                          [MECHANICAL GATE]
                                                                  │
                                                       tests.confirmed-failing
                                                                  │
                                                            implementer
                                                            │       │
                                                  slice.completed  ...
                                                            │
                                                  implementation.completed
                                                            │
                          ┌──────┬───────┬──────────────────┼──────────────────┬─────────┐
                          v      v       v                  v                  v         v
                    code-rev. security tech-writer   ux-rev.            verifier
                          │      │       │                  │                  │
                          └──────┴───────┴──────────────────┴──────────────────┘
                                                     │
                                            [AGGREGATE GATE]
                                            /              \
                                    all pass            hard gate fails
                                       │                       │
                              verification.passed     hard-gate.*-failed
                                       │              (typed per failure)
                                  [ROUTER-EMIT]            │
                                       │                  └─> implementer (retry)
                                feature.shipped
```

## Phase 1: Question

### feature.requested

The entry point. Emitted when the user invokes `/team`.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `questioner`         |
| Gate      | none                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "description": "string — the user's feature description (read ONLY by questioner)",
  "topic": "string — kebab-case derived topic name",
  "today": "string — YYYY-MM-DD",
  "beadsId": "string | null — beads issue id if tracking one"
}
```

---

### task.captured

Questioner has decomposed the user's intent into three artifacts.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `questioner`         |
| Consumers | `file-finder`, `researcher` |
| Gate      | none                 |
| Artifact  | three files in `docs/plans/` (referenced via path fields) |

**Payload:**

```json
{
  "taskPath": "string — docs/plans/<today>-<topic>-task.md (NOT read downstream)",
  "questionsPath": "string — docs/plans/<today>-<topic>-questions.md",
  "briefPath": "string — docs/plans/<today>-<topic>-brief.md",
  "topic": "string"
}
```

The `description` MUST NOT appear in this payload.

---

## Phase 2: Research (blind)

### files.found

File-finder has located all files relevant to the brief.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `file-finder`        |
| Consumers | `router` (join)      |
| Gate      | none                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "files": ["string — file paths relevant to the brief"],
  "summary": "string — brief description of what was found (no inferred intent)"
}
```

---

### research.completed

Router emits after merging `files.found` with the researcher's output.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `design-author`      |
| Gate      | none                 |
| Artifact  | `docs/plans/YYYY-MM-DD-<topic>-research.md` |

**Payload:**

```json
{
  "researchPath": "string — path to merged research artifact",
  "openQuestions": "integer — number of unresolved ambiguities",
  "patterns": ["string — key patterns discovered"],
  "constraints": ["string — constraints identified"]
}
```

---

## Phase 3: Design

### design.drafted

Design author has produced the alignment document. Open questions were
resolved interactively with the user before this event was emitted.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `design-author`      |
| Consumers | `router` (human gate)|
| Gate      | triggers `human` gate (`design-gate`) |
| Artifact  | `docs/plans/YYYY-MM-DD-<topic>-design.md` |

**Payload:**

```json
{
  "designPath": "string",
  "topic": "string",
  "openQuestionsResolved": "integer — number of questions answered with the user before drafting"
}
```

---

### design.approved

Router emits after the user approves the design.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `structure-planner`  |
| Gate      | human gate pass      |
| Artifact  | none                 |

**Payload:** `{ "designPath": "string" }`

---

### design.revision-requested

Router emits after the user rejects the design.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `design-author`      |
| Gate      | human gate fail      |
| Artifact  | none                 |

**Payload:**

```json
{
  "designPath": "string",
  "feedback": "string — user's revision instructions",
  "revisionNumber": "integer"
}
```

---

## Phase 4: Structure

### structure.drafted

Structure planner has broken the approved design into vertical slices.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `structure-planner`  |
| Consumers | `router` (human gate)|
| Gate      | triggers `human` gate (`structure-gate`) |
| Artifact  | `docs/plans/YYYY-MM-DD-<topic>-structure.md` |

**Payload:**

```json
{
  "structurePath": "string",
  "topic": "string",
  "sliceCount": "integer"
}
```

---

### structure.approved

Router emits after the user approves the structure.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `planner`            |
| Gate      | human gate pass      |
| Artifact  | none                 |

**Payload:** `{ "structurePath": "string" }`

---

### structure.revision-requested

Router emits after the user rejects the structure.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `structure-planner`  |
| Gate      | human gate fail      |
| Artifact  | none                 |

**Payload:**

```json
{
  "structurePath": "string",
  "feedback": "string",
  "revisionNumber": "integer"
}
```

---

## Phase 5: Plan

### plan.drafted

Planner has produced the tactical plan. No human gate — the structure was
the contract.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `planner`            |
| Consumers | `router` (worktree-emit gate) |
| Gate      | triggers `router-emit` gate (`worktree-gate`) |
| Artifact  | `docs/plans/YYYY-MM-DD-<topic>-plan.md` |

**Payload:**

```json
{
  "planPath": "string",
  "slices": "integer — slices in the plan",
  "testCount": "integer — total acceptance tests across all slices"
}
```

---

## Phase 6: Worktree

### worktree.prepared

Router emits after creating an isolated git worktree (or recording in-place).

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `test-architect`     |
| Gate      | router-emit gate pass|
| Artifact  | none                 |

**Payload:**

```json
{
  "worktreePath": "string",
  "branch": "string",
  "isolation": "string — 'worktree' | 'in-place'"
}
```

---

## Phase 7: Implement

### tests.written

Test-architect has written all acceptance tests, organized by slice.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `test-architect`     |
| Consumers | `router` (mechanical gate) |
| Gate      | triggers `mechanical` gate (`tests-gate`) |
| Artifact  | none                 |

**Payload:**

```json
{
  "testFiles": ["string — paths to test files created"],
  "testCount": "integer — total number of test cases",
  "planPath": "string — plan the tests were derived from"
}
```

---

### tests.confirmed-failing

Router emits after verifying all tests fail with assertion errors.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `implementer`        |
| Gate      | mechanical gate pass |
| Artifact  | none                 |

**Payload:**

```json
{
  "testFiles": ["string — paths to confirmed-failing test files"],
  "testCount": "integer — total number of test cases",
  "planPath": "string — path to approved plan"
}
```

---

### slice.completed

Implementer signals progress after completing one vertical slice (with commit).

| Field     | Value                |
|-----------|----------------------|
| Producer  | `implementer`        |
| Consumers | `router` (progress tracking) |
| Gate      | none                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "slice": "string — slice name from the structure",
  "testsPassing": ["string — test names now passing"],
  "commit": "string — commit sha for this slice"
}
```

---

### implementation.completed

Implementer signals all slices done and all acceptance tests pass.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `implementer`        |
| Consumers | `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier` |
| Gate      | none                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "testFiles": ["string — test file paths"],
  "testsTotal": "integer — total tests",
  "testsPassing": "integer — passing tests (should equal total)",
  "changedFiles": ["string — files modified during implementation"],
  "slices": "integer — total slices completed"
}
```

---

### review.completed / security-review.completed / docs-review.completed / ux-review.completed / verification.completed

Five parallel reviewer outputs feeding the aggregate gate. Schemas mirror the
RPI-era equivalents:

- `review.completed` (code-reviewer) — verdict, comments, **hard gate**
- `security-review.completed` (security-reviewer) — verdict, OWASP findings, **hard gate**
- `docs-review.completed` (technical-writer) — verdict, doc gaps, advisory
- `ux-review.completed` (ux-reviewer) — verdict, ergonomics findings, soft gate
- `verification.completed` (verifier) — verdict + per-check status (lint, typecheck, build, test), **hard gate**

---

### hard-gate.security-failed / hard-gate.lint-failed / hard-gate.typecheck-failed / hard-gate.build-failed / hard-gate.test-failed / hard-gate.review-failed

Router emits one or more typed failure events when the aggregate gate
detects hard-gate failures. The implementer consumes these in a fix loop
(max 5 rounds across all types).

Each event carries class-specific data: security findings, lint output,
type errors, build errors, failing test names, or blocking `issue:` comments.

---

### verification.passed

Router emits when all hard gates in the aggregate gate pass.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `router` (PR phase)  |
| Gate      | aggregate gate pass (`verification-gate`) |
| Artifact  | none                 |

**Payload:**

```json
{
  "reviewSummary": "string — full review report for PR description",
  "softGateWarnings": ["string — warnings from soft gates, if any"]
}
```

---

## Phase 8: PR

### feature.shipped

Terminal event. Router emits after the user-chosen ship action completes
(open PR, commit locally, or leave uncommitted).

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | none (terminal)      |
| Gate      | router-emit gate (`feature-gate`) |
| Artifact  | none                 |

**Payload:**

```json
{
  "method": "string — 'pr' | 'commit' | 'uncommitted'",
  "branch": "string | null — branch name if PR",
  "prUrl": "string | null — PR URL if created",
  "commitSha": "string | null — commit SHA if committed",
  "duration": "string — total pipeline duration"
}
```

## Gate Reference

| Gate Key            | Type        | Trigger Event             | Pass Event              | Fail Events                                       | Decision By           |
|---------------------|-------------|---------------------------|-------------------------|---------------------------------------------------|-----------------------|
| `design-gate`       | human       | `design.drafted`          | `design.approved`       | `design.revision-requested`                       | User                  |
| `structure-gate`    | human       | `structure.drafted`       | `structure.approved`    | `structure.revision-requested`                    | User                  |
| `worktree-gate`     | router-emit | `plan.drafted`            | `worktree.prepared`     | —                                                 | Router                |
| `tests-gate`        | mechanical  | `tests.written`           | `tests.confirmed-failing` | (retry test setup)                              | Test runner           |
| `verification-gate` | aggregate   | all 5 reviews             | `verification.passed`   | `hard-gate.{security,lint,typecheck,build,test,review}-failed` | Router |
| `feature-gate`      | router-emit | `verification.passed`     | `feature.shipped`       | —                                                 | Router (after user choice) |
| `research-join`     | join        | `files.found`             | `research.completed`    | —                                                 | Router (fan-in)       |
