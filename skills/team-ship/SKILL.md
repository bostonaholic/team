---
name: team-ship
description: Commit, create PR, and ship the implementation after verification passes. Trigger on "ship it", "create the PR", or "/team-ship".
---

# TEAM Ship — Standalone Phase

Run the SHIP phase. Requires `verification.passed` in the event log.

## Execution

1. Read `.team/events.jsonl`. Scan for `verification.passed`.
2. If not found: report "Verification not passed. Run /team-verify first." and stop.
3. Present shipping options:
   - **Commit + PR** — branch, commit, open pull request
   - **Commit locally** — commit to current branch
   - **Keep as-is** — leave changes uncommitted
4. Execute user's choice.
5. Append `feature.shipped` event to the log.
6. Delete `.team/` directory.

## Commit Discipline

When creating the commit, apply the git-commit methodology from
`skills/git-commit/SKILL.md`:

- Use Conventional Commits format: `feat:`, `fix:`, `refactor:`, etc.
- Subject line: 50 characters or fewer, imperative mood, no trailing period
- Body: wrapped at 72 characters, explains *why* not *what*
- One logical change per commit — the feature as a whole, not its
  implementation steps
- Reference the issue or plan in the footer if one exists

The ship commit represents the complete, user-visible feature. Write the
subject to describe what the feature does for users, not how it was built.

## Completion

Report the outcome (PR URL, commit hash, or "kept uncommitted").
