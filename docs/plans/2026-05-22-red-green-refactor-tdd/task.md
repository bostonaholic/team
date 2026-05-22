---
topic: red-green-refactor-tdd
date: 2026-05-22
phase: task
ticketId: null
---

# Task: red-green-refactor-tdd

## Description

Make the implementation phase always follow strict red-green-refactor TDD
discipline by splitting the work across three distinct agents:

1. A "red" agent writes the failing tests and does nothing else.
2. A "green" agent makes the tests pass using the smallest necessary change
   and does nothing else.
3. A "refactor" agent cleans up and simplifies the code, guaranteeing that
   no tests break.

Currently the IMPLEMENT phase runs `test-architect` (writes all failing
acceptance tests once) followed by `implementer` (makes them pass
slice-by-slice, mixing green work and refactoring within each slice). The
user wants these responsibilities separated into three agents so that each
role is enforced structurally, not just by convention.

## Stated goal

Replace or augment the current IMPLEMENT phase agents so that red, green,
and refactor steps are each owned by a dedicated agent and are mechanically
separated.

## Inferred goal

Enforce the red-green-refactor cycle as a first-class pipeline constraint
so that no agent can silently mix "make it work" code with "clean it up"
code — producing a cleaner commit history and a safer refactoring step that
has an explicit test-passing gate before it runs.

## Acceptance signals

- The IMPLEMENT phase table in `skills/team/SKILL.md` and
  `skills/team-implement/SKILL.md` names three distinct agents for red,
  green, and refactor steps (or clearly maps the three steps to agents).
- `agents/` contains the agent definitions covering each of the three roles.
- `skills/team/registry.json` is updated to reflect any new or renamed agents.
- The refactor agent has an explicit gate that verifies tests still pass
  before it declares completion.
- The green agent is constrained to the minimum change needed to pass tests
  (no opportunistic refactoring).
- Existing pipeline behavior — mechanical gate after red, aggregate reviewer
  gate after refactor — is preserved or replaced with an equivalent.

## Open assumptions

- "Another agent" means a separate agent file in `agents/`, not just a
  conceptual sub-step inside an existing agent's instructions.
- The current `test-architect` role covers "red" (writing failing tests); it
  may be kept, renamed, or replaced depending on design.
- The current `implementer` role blends green and refactor; it will need to
  be split or replaced.
- The mechanical gate (confirm tests fail cleanly) stays after red, before
  green.
- The aggregate reviewer gate (5 reviewers) stays after refactor.
- Per-slice commit discipline is preserved — each slice still commits
  atomically, but possibly with separate red/green/refactor commits.
