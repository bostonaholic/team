---
name: team-implement
description: Execute the implementation plan step by step, making failing tests pass. Trigger on "implement the plan", "start implementing", or "/team-implement".
---

# TEAM Implement — Plan Execution

You run the IMPLEMENT phase of the TEAM pipeline. You execute the approved
plan step by step, making failing acceptance tests pass.

## Prerequisites

Both a plan artifact and failing tests are required:

1. Read `.team/state.json` for `planPath` and `testFiles`
2. Verify the plan artifact exists on disk
3. Verify at least one test file exists on disk
4. If either is missing, report the error:
   - No plan: "Run `/team-plan` first."
   - No tests: "Run `/team-test` first."
   **Stop here.** Do not proceed without both.

## Setup

Update `.team/state.json`:
- Set `phase: "IMPLEMENT"`
- Set `currentStep` to the first step in the plan

## Execution

Read the plan artifact. Execute each step in order:

### For Each Step

1. **Read the step.** Identify the file path, what to change, and the
   verification criteria.

2. **Implement the change.** Write the code as specified in the plan. Follow
   the patterns and conventions documented in the research artifact. Use
   existing utilities and helpers identified during research.

3. **Run the test suite.** After each step, run the full test suite and
   record results:
   - Which acceptance tests now pass (newly green)
   - Which acceptance tests still fail (remaining work)
   - Whether any existing tests regressed (must fix immediately)

4. **Update state.** Set `currentStep` to the completed step identifier.
   This enables recovery if context compaction occurs.

5. **Report progress.** After each step, briefly report:
   - What was implemented
   - Test results: X of Y acceptance tests passing
   - Any issues encountered

### Step Ordering

Respect the plan's phase grouping and step annotations:

- `[parallel]` steps within the same phase may be implemented in any order
- `[sequential]` steps must be implemented in the order specified
- Complete all steps in a phase before moving to the next phase

### Regression Handling

If an existing test breaks after a step:

1. Stop implementing new steps
2. Diagnose the regression
3. Fix it before continuing
4. Ensure the fix does not undo the current step's progress

## Completion

When all acceptance tests pass:

1. Run the full test suite one final time to confirm
2. Report the final results:
   - All acceptance tests: PASS
   - Existing test suite: PASS (no regressions)
   - Steps completed: X of Y
3. Suggest: "Run `/team-verify` to run the review gauntlet."

## Gate

All acceptance tests from the plan must pass. Implementation is not
complete until every test is green.

## Error Handling

- If a step cannot be implemented as specified in the plan, report the
  deviation and explain why. Do not silently change the approach.
- If you reach an impasse (a step seems impossible given the codebase),
  stop and report the blocker. Do not guess.
- State is updated after every step. If the process is interrupted, it
  can be resumed from the last completed step via `/team-resume`.
