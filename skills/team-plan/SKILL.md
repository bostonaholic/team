---
name: team-plan
description: Create an implementation plan from research findings. Runs research first if no artifact found. Trigger on "plan the implementation", "create a plan for", or "/team-plan".
---

# TEAM Plan — Standalone Phase

Run the PLAN phase. If no `research.completed` event exists, run RESEARCH first.

## Input

Feature description: `$ARGUMENTS` (optional if event log already has a topic).

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `research.completed`.
2. If not found: run `/team-research $ARGUMENTS` first.
3. Follow the event loop from `skills/team/registry.json`.
4. The loop will dispatch `product-owner` (if needed), `planner`, `plan-critic`.
5. At the human gate (`plan.critiqued`): present plan + verdict-filtered critique for approval.
6. **Stop after `plan.approved` or `plan.revision-requested` is recorded.**

## Completion

Report plan path and suggest: "/team-test to write acceptance tests"
