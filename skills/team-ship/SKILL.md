---
name: team-ship
description: Commit, create PR, and ship the implementation after verification passes. Trigger on "ship it", "create the PR", or "/team-ship".
---

# TEAM Ship — Commit and Deliver

You run the SHIP phase of the TEAM pipeline. You commit the implementation
and deliver it according to the user's preference.

## Prerequisites

Verification must have passed. Check:

1. Read `.team/state.json` — phase should be VERIFY or SHIP
2. Confirm hard gates passed (no unresolved CRITICAL security findings,
   verifier passed)
3. Confirm there are changes to commit (run `git status`)

If verification has not passed, report:
"Verification has not completed or has unresolved hard gate failures.
Run `/team-verify` first."
**Stop here.**

If there are no changes to commit, report:
"No changes detected. Nothing to ship."
**Stop here.**

## Setup

Update `.team/state.json`:
- Set `phase: "SHIP"`

## Shipping Options

Present the user with three options:

### Option 1: Commit + Pull Request (recommended)

1. Create a feature branch: `team/<topic>`
2. Stage all relevant files (source code, tests, documentation)
   - Do NOT stage `.team/state.json`
   - Do NOT stage files containing secrets
3. Create a commit with a descriptive message derived from the plan
4. Push the branch to the remote
5. Create a pull request with:
   - **Title:** derived from the plan's Context section
   - **Body:** includes plan summary, test summary, and verification report

### Option 2: Commit Locally

1. Stage all relevant files on the current branch
2. Create a commit with a descriptive message
3. Do not push or create a PR

### Option 3: Keep As-Is

1. Report what files were changed
2. Leave everything uncommitted for manual handling

## Execution

Ask the user: "How would you like to ship? (1) Commit + PR, (2) Commit
locally, (3) Keep as-is"

Execute the chosen option. For options 1 and 2, follow the project's git
conventions:

- Use conventional commit format if the project uses it
- Keep the commit message concise (under 72 chars for subject)
- Reference the plan artifact in the commit body

## Cleanup

After successful shipping (any option):

1. Delete `.team/state.json`
2. Report the final outcome:
   - For PR: the PR URL
   - For local commit: the commit hash
   - For keep as-is: the list of changed files
3. Print a completion summary:

```
## TEAM Pipeline Complete

Feature: <topic>
Phases completed: RESEARCH -> PLAN -> TEST-FIRST -> IMPLEMENT -> VERIFY -> SHIP
Artifacts:
  - Research: <path>
  - Plan: <path>
  - Tests: <file list>
Outcome: <PR URL / commit hash / uncommitted>
```

## Error Handling

- If git operations fail (branch exists, push rejected, PR creation fails),
  report the error and suggest manual resolution.
- Do not force-push or use destructive git operations.
- If cleanup of state.json fails, warn but do not treat as a pipeline
  failure.
