---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel read-only agents to explore and document findings. Trigger on "research this", "explore the codebase for", or "/team-research".
---

# TEAM Research — Standalone Phase

Run the RESEARCH phase only, then stop.

## Input

Feature description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user what to research and stop.

## Execution

1. Derive a kebab-case `topic` and set `today` to `YYYY-MM-DD`.
2. Create `~/.team/` and `docs/plans/` directories if needed.
3. Append `feature.requested` event to `~/.team/events.jsonl`.
4. Follow the event loop defined in `/team` (read `skills/team/registry.json`).
5. **Stop after `research.completed` is recorded** — do not continue to PLAN.

## Completion

Report:
- Path to the research artifact
- Key findings (3-5 bullets)
- Open questions count
- Suggest: "/team-plan to create an implementation plan"
