---
name: rpi-workflow
description: Research-Plan-Implement phase discipline with gate enforcement — loaded by orchestrator to govern pipeline phase transitions, artifact conventions, and anti-patterns
---

# RPI Workflow

Phase discipline for the TEAM pipeline. Every feature flows through six
sequential phases. No phase may be skipped. Each phase produces artifacts
that downstream phases consume.

## Phase Sequence

```
RESEARCH -> PLAN -> TEST-FIRST -> IMPLEMENT -> VERIFY -> SHIP
```

### RESEARCH

Explore the codebase. Produce objective findings. No opinions, no code changes.

- **Artifact:** `docs/plans/YYYY-MM-DD-<topic>-research.md`
- **Gate:** HARD — artifact must exist on disk before proceeding

### PLAN

Turn research into a precise, actionable implementation plan.

- **Artifact:** `docs/plans/YYYY-MM-DD-<topic>-plan.md`
- **Gate:** HARD — user must explicitly approve the plan

### TEST-FIRST

Write all acceptance tests from the approved plan. Confirm they fail correctly.

- **Artifact:** Test files listed in the plan
- **Gate:** HARD — all tests exist, all tests fail with assertion failures (not errors)

### IMPLEMENT

Execute the plan step by step, making tests pass.

- **Artifact:** Production code, passing tests
- **Gate:** HARD — all acceptance tests pass

### VERIFY

Parallel adversarial review with fresh-context agents.

- **Gate:** Security = HARD, Tests = HARD, Code = SOFT, UX = SOFT, Docs = ADVISORY

### SHIP

Commit, create PR, confirm CI passes.

- **Gate:** CI passes

## Artifact Conventions

All plan artifacts live in `docs/plans/`:

| Artifact | Pattern | Created By |
|----------|---------|------------|
| Research | `YYYY-MM-DD-<topic>-research.md` | researcher agent |
| Plan | `YYYY-MM-DD-<topic>-plan.md` | planner agent |

Use today's date. The `<topic>` slug should be lowercase, hyphen-separated,
and match across research and plan files for the same feature.

## Gate Types

### HARD

Blocks phase transition. The pipeline cannot proceed until the gate condition
is satisfied. No override allowed except by explicit user command.

Examples: plan approval, security review with critical findings, test failures.

### SOFT

Informational gate. The pipeline presents findings to the user and may proceed
at the user's judgment. The user is expected to read and acknowledge.

Examples: code review suggestions, UX review feedback.

### ADVISORY

Non-blocking. Findings are recorded but do not require acknowledgment. The
pipeline proceeds automatically.

Examples: documentation gap analysis, style suggestions.

## Phase Transition Protocol

Phase transitions are event-driven. Every transition follows this sequence:

1. **Record event** — Append the output event to `~/.team/<topic>/events.jsonl`
2. **Verify artifacts** — Confirm all required artifacts from the current phase exist on disk
3. **Evaluate gates** — Check gate conditions defined in `skills/team/registry.json`
4. **Proceed** — Dispatch the next agent(s) that consume the output event

Never proceed to the next phase while a HARD gate is failing. SOFT gates
require user acknowledgment before proceeding.

## Anti-Patterns

### Skipping Research

Jumping to planning without understanding the codebase leads to plans that
conflict with existing patterns, miss reusable components, or break implicit
contracts. Always research first, even for "simple" changes.

### Implementing Without Plan Approval

The plan is the single human gate. Bypassing it removes the user's ability to
course-correct before work begins. Wait for explicit approval.

### Gold-Plating

Adding features, tests, or abstractions beyond what the plan specifies.
The plan defines the scope fence. If scope needs to expand, update the plan
and get re-approval — do not silently add work.

### Backward Skipping

Jumping backward more than one phase (e.g., from VERIFY to RESEARCH). If
verification fails, return to IMPLEMENT. If implementation reveals a plan flaw,
return to PLAN. Never skip backward multiple phases at once.

### Premature Shipping

Attempting to ship before verification completes. Every HARD gate in VERIFY
must pass. Skipping verification risks shipping broken or insecure code.
