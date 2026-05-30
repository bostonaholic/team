---
name: progress-tracking
description: Todo-first progress convention for multi-step procedures — loaded by every agent that runs a numbered procedure (questioner, design-author, structure-planner, planner, test-architect, implementer, code-reviewer, security-reviewer, ux-reviewer, technical-writer, researcher, verifier) so each tracks its own steps without drift
user-invocable: false
---

# Progress Tracking

A convention, not a gate. It produces no artifact and blocks nothing. It
shapes how any agent or skill executing a multi-step procedure keeps its own
work visible, so steps are not silently skipped.

## When it applies

When a procedure has two or more ordered steps, seed one todo item per step
before starting and mark each complete as you go. A single-step procedure is
exempt — a one-item ledger is noise.

## Per-step granularity

One todo item per numbered step — not per phase, not per file. Mark each item
`in_progress` when its step starts and `completed` when that step lands,
matching how `team-fix` already marks each step. Keep items at the
granularity of the procedure's own numbered list.

## Ledger ownership

The **orchestrator** (the main Claude Code session) owns the single
phase-level ledger. An **agent** executing a multi-step skill tracks its own
sub-steps **within its own context** and never merges them up into the
orchestrator's phase ledger. A standalone, directly-invoked skill seeds its
own ledger. The two ledgers live in separate ownership scopes and are never
read across.

## See also

The orchestrator's phase-level TodoWrite contract lives in
`skills/qrspi-workflow/SKILL.md` — the phase-ledger sibling of this
per-procedure convention.
