# Event Catalog

> Every state change in the TEAM pipeline is an event. This catalog is the
> definitive reference for all events, their schemas, and their relationships.

## Event Envelope

Every event in `.team/<topic>/events.jsonl` follows this envelope:

```json
{
  "seq": 1,
  "event": "feature.requested",
  "producer": "router",
  "ts": "2026-03-28T14:30:00Z",
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

## Event Flow

```
feature.requested
    ├──> file-finder ──> files.found ─────────────┐
    └──> researcher ──────────────────────────────>├──> research.completed
                                                   │
                                            product-owner
                                                   │
                                          requirements.assessed
                                                   │
                                           [INTERVIEW GATE]
                                          /                 \
                                   confidence              confidence
                                     ≥ 95%                   < 95%
                                       │                       │
                                requirements.       requirements.revision
                                  confirmed            -requested
                                       │                       │
                                       v                       └──> product-owner
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
                   verification.passed     hard-gate.*-failed
                          │               (typed per failure)
                   feature.shipped          └──> implementer (retry)
```

## Events

### feature.requested

The entry point. Emitted when the user invokes `/team`.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `file-finder`, `researcher` |
| Gate      | none                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "description": "string — the user's feature description",
  "topic": "string — kebab-case derived topic name",
  "today": "string — YYYY-MM-DD"
}
```

---

### files.found

File-finder has located all files relevant to the feature.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `file-finder`        |
| Consumers | `router` (join)      |
| Gate      | none                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "files": ["string — file paths relevant to the feature"],
  "summary": "string — brief description of what was found"
}
```

---

### research.completed

Router emits after merging `files.found` with the researcher's output.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `product-owner`      |
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

### requirements.assessed

Product-owner has assessed the user's requirements and rated confidence.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `product-owner`      |
| Consumers | `router` (interview gate) |
| Gate      | triggers `interview` gate |
| Artifact  | `docs/plans/YYYY-MM-DD-<topic>-prd.md` (if PRD produced) |

**Payload:**

```json
{
  "confidence": "integer — 0-100, percentage confidence in understanding",
  "understanding": "string — restated user intent in product-owner's words",
  "validatedRequirements": ["string — requirements stated clearly and actionably"],
  "decisions": [
    {
      "question": "string — an ambiguity resolved autonomously",
      "decision": "string — the resolution",
      "rationale": "string — why, citing codebase precedent"
    }
  ],
  "openQuestions": ["string — questions for the user, empty when confidence ≥ 95%"],
  "prdPath": "string | null — path to PRD artifact if produced"
}
```

---

### requirements.confirmed

Router emits when the interview gate passes (confidence ≥ 95%).

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `planner`            |
| Gate      | interview gate pass  |
| Artifact  | none                 |

**Payload:**

```json
{
  "validatedRequirements": ["string — confirmed requirements"],
  "decisions": ["object — autonomous decisions from the product-owner"],
  "prdPath": "string | null — path to PRD artifact if produced",
  "interviewRounds": "integer — number of question rounds (0 = auto-passed)"
}
```

---

### requirements.revision-requested

Router emits when interview gate needs more information (confidence < 95%).

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `product-owner`      |
| Gate      | interview gate fail  |
| Artifact  | none                 |

**Payload:**

```json
{
  "answers": ["string — user's answers to the product-owner's questions"],
  "priorAssessment": "object — the previous requirements.assessed payload",
  "revisionNumber": "integer — which round of questions this is"
}
```

---

### plan.drafted

Planner has produced an implementation plan.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `planner`            |
| Consumers | `plan-critic`        |
| Gate      | none                 |
| Artifact  | `docs/plans/YYYY-MM-DD-<topic>-plan.md` |

**Payload:**

```json
{
  "planPath": "string — path to plan artifact",
  "steps": "integer — number of implementation steps",
  "testCount": "integer — number of acceptance tests specified"
}
```

---

### plan.critiqued

Plan-critic has reviewed the plan adversarially.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `plan-critic`        |
| Consumers | `router` (human gate)|
| Gate      | triggers `human` gate|
| Artifact  | none                 |

**Payload:**

```json
{
  "verdict": "string — 'PASS' | 'PASS WITH CHANGES' | 'REVISE'",
  "issues": [
    {
      "severity": "string — 'critical' | 'major' | 'minor' | 'nitpick'",
      "description": "string",
      "suggestion": "string"
    }
  ],
  "planPath": "string — path to the plan under review"
}
```

---

### plan.approved

Router emits after the user approves the plan.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `test-architect`     |
| Gate      | human gate pass      |
| Artifact  | none                 |

**Payload:**

```json
{
  "planPath": "string — path to approved plan",
  "criticVerdict": "string — critic verdict at time of approval ('PASS' | 'PASS WITH CHANGES' | 'REVISE')",
  "userFeedback": "string | null — any notes from the user"
}
```

---

### plan.revision-requested

Router emits if the user rejects the plan.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `planner`            |
| Gate      | human gate fail      |
| Artifact  | none                 |

**Payload:**

```json
{
  "planPath": "string — path to rejected plan",
  "feedback": "string — user's revision instructions",
  "revisionNumber": "integer — how many times the plan has been revised"
}
```

---

### tests.written

Test-architect has written all acceptance tests.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `test-architect`     |
| Consumers | `router` (mechanical gate) |
| Gate      | triggers `mechanical` gate |
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

### step.completed

Implementer signals progress after completing a plan step.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `implementer`        |
| Consumers | `router` (progress tracking) |
| Gate      | none                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "step": "string — step identifier from the plan",
  "testsPassingBefore": "integer",
  "testsPassingAfter": "integer",
  "totalTests": "integer"
}
```

---

### implementation.completed

Implementer signals all acceptance tests pass.

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
  "changedFiles": ["string — files modified during implementation"]
}
```

---

### review.completed

Code reviewer has finished quality review.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `code-reviewer`      |
| Consumers | `router` (aggregate) |
| Gate      | **hard**             |
| Artifact  | none                 |

**Payload:**

```json
{
  "verdict": "string — 'pass' | 'fail'",
  "comments": [
    {
      "type": "string — conventional comment type",
      "file": "string",
      "line": "integer | null",
      "body": "string"
    }
  ]
}
```

---

### security-review.completed

Security reviewer has finished OWASP audit.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `security-reviewer`  |
| Consumers | `router` (aggregate) |
| Gate      | **hard**             |
| Artifact  | none                 |

**Payload:**

```json
{
  "verdict": "string — 'pass' | 'fail'",
  "findings": [
    {
      "severity": "string — 'critical' | 'high' | 'medium' | 'low' | 'info'",
      "category": "string — OWASP category",
      "description": "string",
      "file": "string",
      "remediation": "string"
    }
  ]
}
```

---

### docs-review.completed

Technical writer has finished documentation gap analysis.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `technical-writer`   |
| Consumers | `router` (aggregate) |
| Gate      | advisory             |
| Artifact  | none                 |

**Payload:**

```json
{
  "verdict": "string — 'pass' | 'fail'",
  "gaps": [
    {
      "type": "string — 'missing' | 'outdated' | 'incomplete'",
      "file": "string",
      "description": "string"
    }
  ]
}
```

---

### ux-review.completed

UX reviewer has finished ergonomics review.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `ux-reviewer`        |
| Consumers | `router` (aggregate) |
| Gate      | soft                 |
| Artifact  | none                 |

**Payload:**

```json
{
  "verdict": "string — 'pass' | 'fail'",
  "findings": [
    {
      "severity": "string — 'critical' | 'major' | 'minor'",
      "description": "string",
      "suggestion": "string"
    }
  ]
}
```

---

### verification.completed

Verifier has run lint, type check, build, and tests.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `verifier`           |
| Consumers | `router` (aggregate) |
| Gate      | **hard**             |
| Artifact  | none                 |

**Payload:**

```json
{
  "verdict": "string — 'pass' | 'fail'",
  "checks": {
    "lint": "string — 'pass' | 'fail' | 'skipped'",
    "typecheck": "string — 'pass' | 'fail' | 'skipped'",
    "build": "string — 'pass' | 'fail' | 'skipped'",
    "tests": "string — 'pass' | 'fail' | 'skipped'"
  },
  "failures": ["string — descriptions of what failed"]
}
```

---

### reviews.aggregated

Router emits after collecting all five reviewer events.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `router` (gate check)|
| Gate      | triggers `aggregate` gate |
| Artifact  | none                 |

**Payload:**

```json
{
  "reviewEvents": ["integer — seq numbers of all five review events"],
  "hardGatesPassed": "boolean",
  "softGatesPassed": "boolean",
  "summary": "string — aggregated verdict summary"
}
```

---

### hard-gate.security-failed

Router emits when the security reviewer finds CRITICAL or HIGH severity vulnerabilities.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `implementer` (retry)|
| Gate      | aggregate gate fail  |
| Artifact  | none                 |

**Payload:**

```json
{
  "findings": [
    {
      "severity": "string — 'critical' | 'high'",
      "category": "string — OWASP category",
      "file": "string",
      "line": "integer",
      "description": "string",
      "remediation": "string"
    }
  ],
  "retryRound": "integer — current round (across all failure types)",
  "maxRetries": 5
}
```

---

### hard-gate.lint-failed

Router emits when format or lint checks fail.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `implementer` (retry)|
| Gate      | aggregate gate fail  |
| Artifact  | none                 |

**Payload:**

```json
{
  "command": "string — the lint/format command that failed",
  "exitCode": "integer",
  "errors": "string — relevant error output",
  "retryRound": "integer",
  "maxRetries": 5
}
```

---

### hard-gate.typecheck-failed

Router emits when type checking fails.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `implementer` (retry)|
| Gate      | aggregate gate fail  |
| Artifact  | none                 |

**Payload:**

```json
{
  "command": "string — the typecheck command that failed",
  "exitCode": "integer",
  "errors": "string — type error output with file paths and line numbers",
  "retryRound": "integer",
  "maxRetries": 5
}
```

---

### hard-gate.build-failed

Router emits when the production build fails.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `implementer` (retry)|
| Gate      | aggregate gate fail  |
| Artifact  | none                 |

**Payload:**

```json
{
  "command": "string — the build command that failed",
  "exitCode": "integer",
  "errors": "string — build error output",
  "retryRound": "integer",
  "maxRetries": 5
}
```

---

### hard-gate.test-failed

Router emits when the test suite has failures.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `implementer` (retry)|
| Gate      | aggregate gate fail  |
| Artifact  | none                 |

**Payload:**

```json
{
  "command": "string — the test command that failed",
  "exitCode": "integer",
  "failingTests": ["string — names of failing tests"],
  "errors": "string — relevant assertion/error output",
  "retryRound": "integer",
  "maxRetries": 5
}
```

---

### hard-gate.review-failed

Router emits when the code reviewer issues a REQUEST CHANGES verdict.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `implementer` (retry)|
| Gate      | aggregate gate fail  |
| Artifact  | none                 |

**Payload:**

```json
{
  "verdict": "string — 'request-changes'",
  "blockingIssues": [
    {
      "type": "string — 'issue'",
      "file": "string",
      "line": "integer | null",
      "body": "string"
    }
  ],
  "retryRound": "integer",
  "maxRetries": 5
}
```

---

### verification.passed

Router emits when all hard gates pass in the aggregate review.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | `router` (ship)      |
| Gate      | aggregate gate pass  |
| Artifact  | none                 |

**Payload:**

```json
{
  "reviewSummary": "string — full review report for PR description",
  "softGateWarnings": ["string — warnings from soft gates, if any"]
}
```

---

### feature.shipped

Router emits after successful commit/PR/merge.

| Field     | Value                |
|-----------|----------------------|
| Producer  | `router`             |
| Consumers | none (terminal)      |
| Gate      | none                 |
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

| Gate Type    | Trigger Event            | Pass Event               | Fail Events               | Decision By |
|-------------|--------------------------|--------------------------|---------------------------|-------------|
| interview   | `requirements.assessed`  | `requirements.confirmed` | `requirements.revision-requested` | Router (auto-pass ≥95%) or User |
| human       | `plan.critiqued`         | `plan.approved`          | `plan.revision-requested` | User        |
| mechanical  | `tests.written`          | `tests.confirmed-failing`| (retry test setup)        | Test runner |
| aggregate   | all 5 reviews            | `verification.passed`    | `hard-gate.{security,lint,typecheck,build,test,review}-failed` | Router |
| join        | `files.found`            | `research.completed`     | —                         | Router (fan-in) |
