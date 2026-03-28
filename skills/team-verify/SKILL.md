---
name: team-verify
description: Run 5 parallel reviewers against the implementation. Security review is a hard gate. Trigger on "verify the implementation", "run reviews", or "/team-verify".
---

# TEAM Verify — Review Gauntlet

You run the VERIFY phase of the TEAM pipeline. Five independent reviewers
evaluate the implementation in parallel with fresh context.

## Prerequisites

An implementation must exist. Check:

1. Read `.team/state.json` — phase should be IMPLEMENT or later
2. Verify the plan artifact exists at `planPath`
3. Verify there are uncommitted or recently committed changes to review

If no implementation is detected, report:
"No implementation found to verify. Run `/team-implement` first."
**Stop here.**

## Setup

Update `.team/state.json`:
- Set `phase: "VERIFY"`

## Execution

Dispatch all 5 reviewers **in parallel**:

### code-reviewer (soft gate)

Reviews code quality, correctness, maintainability, and adherence to done
criteria. Returns a verdict: APPROVE, REQUEST CHANGES, or COMMENT.

### security-reviewer (HARD gate)

Applies OWASP-style security checks. Returns severity-classified findings
and a verdict: PASS or FAIL. CRITICAL findings are a hard gate.

### technical-writer (advisory)

Checks whether documentation needs updating after the implementation.
Returns a list of REQUIRED and RECOMMENDED documentation gaps.

### ux-reviewer (soft gate)

Boots the application (if applicable) and verifies the feature works from
a user's perspective. Returns a report of working, broken, and improvable
aspects.

### verifier (hard gate)

Runs all mechanical checks: format, lint, type check, build, tests.
Returns a pass/fail verdict with evidence.

## Aggregation

After all reviewers complete, build a consolidated report:

```
## Verification Report

### Gate Status

| Reviewer          | Verdict          | Gate   |
|-------------------|------------------|--------|
| code-reviewer     | APPROVE/CHANGES  | Soft   |
| security-reviewer | PASS/FAIL        | HARD   |
| technical-writer  | X required gaps  | Info   |
| ux-reviewer       | Works/Broken     | Soft   |
| verifier          | PASS/FAIL        | HARD   |

### Hard Gate: PASS / FAIL
### Overall: READY TO SHIP / BLOCKED

### Details
[Full output from each reviewer, organized by section]
```

## Gate Logic

**Hard gates** (must pass to ship):
- security-reviewer: verdict must be PASS (no CRITICAL findings)
- verifier: verdict must be PASS (all checks green)

**Soft gates** (user informed, may override):
- code-reviewer: REQUEST CHANGES is shown but does not block
- ux-reviewer: broken items are shown but do not block

**Advisory** (information only):
- technical-writer: documentation gaps are reported

### On Hard Gate Failure

1. Increment `backwardTransitions` in state
2. If `backwardTransitions < 3`:
   - Report the specific failures that caused the hard gate to fail
   - List the exact issues to fix
   - Automatically loop back to IMPLEMENT to address the failures
   - After fixes, re-run VERIFY (only the failed reviewers, not all 5)
3. If `backwardTransitions >= 3`:
   - Stop and escalate to the user
   - Report: "Hard gate has failed 3 times. Manual intervention required."
   - List all unresolved findings across all retry attempts

## Completion

If all hard gates pass, report:

- The full verification report
- Any soft gate concerns the user should be aware of
- Documentation gaps that should be addressed (now or later)
- Suggest: "Run `/team-ship` to commit and create a PR."

## Error Handling

- If a reviewer agent fails to complete, mark it as SKIPPED in the report
  and warn the user that review was incomplete.
- Never treat a skipped review as a pass. A skipped hard-gate reviewer
  means the gate status is UNKNOWN, not PASS.
- If all reviewers fail, report the failures and suggest re-running.
