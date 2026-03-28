---
name: team-resume
description: Resume an interrupted TEAM pipeline from where it left off. Reads .team/state.json and continues from the current phase. Trigger on "resume the pipeline", "continue where we left off", or "/team-resume".
---

# TEAM Resume — Pipeline Recovery

You resume an interrupted TEAM pipeline from the last recorded state. This
handles recovery after context compaction, crashes, or manual interruption.

## State Recovery

1. Read `.team/state.json`. If it does not exist, report:
   "No pipeline state found. Nothing to resume. Start a new pipeline with
   `/team`."
   **Stop here.**

2. Parse the state and validate:
   - `phase` must be one of: RESEARCH, PLAN, TEST-FIRST, IMPLEMENT, VERIFY, SHIP
   - `topic` must be a non-empty string
   - `startedAt` must be a valid ISO-8601 timestamp

3. Report the recovered state to the user:

```
## Pipeline State Recovered

Topic: <topic>
Phase: <phase>
Current step: <currentStep or "none">
Started: <startedAt>
Backward transitions: <backwardTransitions>
```

## Artifact Validation

Before resuming, verify that the artifacts required for the current phase
still exist on disk:

| Phase       | Required Artifacts                          |
|-------------|---------------------------------------------|
| RESEARCH    | None (starting fresh)                       |
| PLAN        | Research artifact at `researchPath`          |
| TEST-FIRST  | Plan artifact at `planPath`                 |
| IMPLEMENT   | Plan artifact + test files in `testFiles`   |
| VERIFY      | Plan artifact + test files + implementation |
| SHIP        | All of the above                            |

For each required artifact:
- Check that the file exists at the recorded path
- If a file is missing, report it and suggest re-running the phase that
  produces it

If all required artifacts are present, report: "All artifacts validated."

If any are missing, report which are missing and suggest the corrective
action. Do not silently re-run earlier phases.

## Resume Logic

Resume from the current phase. Use the corresponding skill logic:

### RESEARCH
Re-run the research phase from the beginning. Prior partial results may
exist at `researchPath` — overwrite them.

### PLAN
- If `researchPath` artifact exists, proceed to planning
- If the plan already exists at `planPath`, skip to critique and approval
- Present the plan for user approval (the hard gate still applies)

### TEST-FIRST
- If `planPath` artifact exists, dispatch the test-architect
- If test files already exist in `testFiles`, verify they still fail
  correctly. Only re-write tests that are missing.

### IMPLEMENT
- If `currentStep` is set, resume from the NEXT step after it
- Run the test suite first to establish the current pass/fail baseline
- Continue implementing from where you left off

### VERIFY
- Re-run all 5 reviewers (reviewer state is not persisted, so a fresh
  review is needed after any interruption)

### SHIP
- Check `git status` to see what needs committing
- Present shipping options as usual

## Completion

After successfully resuming and completing the current phase, continue
to the next phase automatically — follow the full pipeline logic from
`/team` for all subsequent phases.

## Error Handling

- If state.json is corrupted or unparseable, report the raw content and
  suggest starting fresh with `/team`.
- If the phase recorded in state does not match the artifacts on disk
  (e.g., state says IMPLEMENT but no plan exists), report the inconsistency
  and suggest which phase to re-run.
- Never silently correct state inconsistencies. Always report what you
  found and let the user decide.
