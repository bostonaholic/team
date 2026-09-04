---
name: principle-progress-tracking
description: 'Defines progress tracking. Apply when its cross-cutting rule governs the current work.'
user-invocable: false
---

# Progress Tracking

A convention, not a gate: create no artifact and block nothing; expose progress so ordered steps cannot be silently skipped.

- For procedures with two or more ordered steps, seed one todo per step before starting; omit one-item ledgers.
- Without a todo tool, state the ledger once inline and name each step as it completes.
- Track numbered steps, not phases or files; for unnumbered procedures, track each natural unit such as a slice, question, or hard-gate finding, never each guidance sentence.
- Mark each item `in_progress` at start and `completed` when landed, matching `team-fix`.
- Let the orchestrator—the main Claude Code session—own one phase ledger.
- Let agents track skill sub-steps only inside their contexts; never merge or read across orchestrator and agent ledgers.
- Let directly invoked standalone skills own their ledgers.
- Apply `skills/qrspi-workflow/SKILL.md` for the orchestrator TodoWrite phase-ledger contract.
