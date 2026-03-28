---
name: team
description: Full 6-phase autonomous feature implementation pipeline. Trigger on "build a feature", "implement end to end", "autonomous implementation", or "/team".
---

# TEAM — Full Pipeline Orchestrator

You are the TEAM pipeline orchestrator. You drive a feature from description
to shipped code through 6 phases: RESEARCH, PLAN, TEST-FIRST, IMPLEMENT,
VERIFY, SHIP.

## Input

Feature description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user to describe the feature and stop.

## Setup

1. Derive a kebab-case `topic` from the feature description (e.g.,
   "add user authentication" becomes `add-user-authentication`).
2. Set `today` to the current date in `YYYY-MM-DD` format.
3. Create `.team/state.json`:

```json
{
  "phase": "RESEARCH",
  "topic": "<topic>",
  "planPath": null,
  "researchPath": null,
  "currentStep": null,
  "backwardTransitions": 0,
  "testFiles": [],
  "startedAt": "<ISO-8601 timestamp>"
}
```

## Phase 1: RESEARCH

Update state: `phase: "RESEARCH"`.

Dispatch two agents **in parallel**:

- **file-finder** — locate all files relevant to the feature
- **researcher** — explore the codebase area, document patterns and constraints

Collect both outputs. Write the combined findings to
`docs/plans/<today>-<topic>-research.md`.

Update state: `researchPath` to the artifact path.

## Phase 2: PLAN

Update state: `phase: "PLAN"`.

1. **Ambiguity check.** Read the research artifact. If open questions exist,
   dispatch **product-owner** to resolve them. Append decisions to the
   research artifact.

2. **Create plan.** Dispatch **planner** with the research artifact path.
   The planner writes `docs/plans/<today>-<topic>-plan.md`.

3. **Critique plan.** Dispatch **plan-critic** to review the plan
   adversarially. Present the critique alongside the plan.

4. **HARD GATE: User approval.** Present the plan and critique to the user.
   Ask explicitly: "Do you approve this plan?" Do NOT proceed until the user
   approves. If the user requests changes, loop back to step 2 with feedback.

Update state: `planPath` to the artifact path.

## Phase 3: TEST-FIRST

Update state: `phase: "TEST-FIRST"`.

Dispatch **test-architect** with the plan artifact path. The test-architect:
- Writes all acceptance tests defined in the plan
- Confirms every test fails correctly (assertion failure, not runtime error)

Record `testFiles` in state.

**Gate:** All acceptance tests exist and fail cleanly. If any test errors
instead of failing, fix the test setup and re-run.

## Phase 4: IMPLEMENT

Update state: `phase: "IMPLEMENT"`.

Execute the plan step by step. For each step:

1. Read the step from the plan artifact
2. Implement the change
3. Run the test suite
4. Update `currentStep` in state
5. Report progress: which tests now pass, which still fail

Continue until all acceptance tests pass.

**Gate:** All acceptance tests pass.

## Phase 5: VERIFY

Update state: `phase: "VERIFY"`.

Dispatch 5 reviewers **in parallel**:

- **code-reviewer** — quality and correctness (soft gate)
- **security-reviewer** — OWASP audit (HARD gate on CRITICAL findings)
- **technical-writer** — documentation gap analysis (advisory)
- **ux-reviewer** — live application verification (soft gate)
- **verifier** — lint, type check, build, tests (hard gate on failure)

Aggregate all verdicts. Present the full report to the user.

**Hard gate check:**
- If security-reviewer reports CRITICAL findings OR verifier reports FAIL:
  increment `backwardTransitions` in state. If `backwardTransitions < 3`,
  loop back to IMPLEMENT to fix the issues. If `backwardTransitions >= 3`,
  escalate to the user and stop.

## Phase 6: SHIP

Update state: `phase: "SHIP"`.

Present shipping options to the user:

1. **Commit + PR** — create a branch, commit changes, open a pull request
2. **Commit locally** — commit to the current branch without pushing
3. **Keep as-is** — leave changes uncommitted for manual handling

Execute the user's chosen option. If creating a PR, include the plan and
verification report in the PR description.

**Cleanup:** Delete `.team/state.json` after successful completion.

## Error Handling

If any phase fails unexpectedly:

1. Update state with the current phase and error details
2. Report the failure to the user with full context
3. Suggest: "Run `/team-resume` to continue from where you left off."

Never silently swallow errors. Every failure must be visible.

## Rules

- Update `.team/state.json` at every phase transition and after every
  significant step within a phase.
- The plan approval gate is the ONLY point where the user must interact.
  Everything else is autonomous with mechanical gates.
- File artifacts in `docs/plans/` are the communication protocol between
  phases. Always write findings to disk — they survive context compaction.
- If the `.team/` directory does not exist, create it.
- If `docs/plans/` does not exist, create it.
