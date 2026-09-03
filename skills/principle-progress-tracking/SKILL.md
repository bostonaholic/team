---
name: principle-progress-tracking
description: "Apply when executing any procedure with two or more ordered steps. Seed one todo item per step before starting and mark each complete as you go; the context running the procedure owns its own ledger and never merges it upward."
user-invocable: false
---

# Progress Tracking

A convention, not a gate. It produces no artifact and blocks nothing. It
shapes how any agent or skill executing a multi-step procedure keeps its own
work visible, so steps are not silently skipped.

## When it applies

When a procedure has two or more ordered steps, seed one todo item per step
before starting and mark each complete as you go. The rule starts at two
because a one-item ledger is noise.

When the host offers no todo tool, keep the same ledger inline: state the
step list once at the start and name each step as it completes. The
ledger's job is visibility, and a reply that names the step is visible in
the same way a todo item is.

## Per-step granularity

One todo item per numbered step — not per phase, not per file. When a
procedure states goals and constraints rather than numbered steps, seed one
item per natural unit of work (a slice, a question, a hard-gate finding),
never one per sentence of guidance. Mark each item `in_progress` when its
step starts and `completed` when that step lands, matching how `team-fix`
already marks each step.

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
