---
name: team-plan
description: Create an implementation plan from research findings. Runs research first if no artifact found. Trigger on "plan the implementation", "create a plan for", or "/team-plan".
---

# TEAM Plan — Implementation Planning

You run the PLAN phase of the TEAM pipeline. If no research artifact exists,
you run RESEARCH first.

## Input

Feature description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, check `.team/state.json` for an active topic. If
no state exists either, ask the user to describe the feature and stop.

## Prerequisites

Check for a research artifact:

1. Read `.team/state.json` for `researchPath`
2. If `researchPath` is set, verify the file exists on disk
3. If no research artifact is found, run the RESEARCH phase first:
   - Inform the user: "No research artifact found. Running research first."
   - Follow the same process as `/team-research`
   - Continue to planning after research completes

## Setup

Update `.team/state.json`:
- Set `phase: "PLAN"`
- Set `topic` if not already set (derive from `$ARGUMENTS`)

## Execution

### Step 1: Resolve Ambiguity (conditional)

Read the research artifact. If it contains an "Open Questions" section with
unresolved items:

- Dispatch **product-owner** with the research artifact and the list of
  open questions
- The product-owner returns structured decisions with rationale
- Append the decisions to the research artifact under a "## Decisions"
  section

### Step 2: Create Plan

Dispatch **planner** with instructions to:

- Read the research artifact at the path in state
- Produce a plan at `docs/plans/<today>-<topic>-plan.md`
- Follow the plan structure: Context, Steps (grouped into phases with
  parallel/sequential markers), Tests, Done Criteria

### Step 3: Critique Plan

Dispatch **plan-critic** with the plan artifact path. The critic:

- Verifies file paths and function signatures against the actual codebase
- Checks feasibility, completeness, scope, test coverage, and consistency
- Returns a verdict: PASS, PASS WITH CHANGES, or REVISE

### Step 4: Present for Approval

Present to the user:

1. **Plan summary** — the plan's Context section and step count
2. **Critique verdict** — the critic's verdict and any critical/major issues
3. **Full artifacts** — paths to both the plan and research artifacts

**HARD GATE:** Ask explicitly: "Do you approve this plan?"

- If **approved**: update state with `planPath`, report success, suggest
  "Run `/team-test` to write acceptance tests."
- If **changes requested**: note the feedback, loop back to Step 2 with the
  user's feedback incorporated. The planner should revise, not start over.
- If **REVISE verdict from critic**: recommend the user request changes
  before approving, but let them override if they choose.

## Error Handling

- If the planner fails, report the error and preserve the research artifact.
- If the critic fails, present the plan without a critique and warn the user
  that adversarial review was skipped.
- Never delete or overwrite the research artifact during planning.
