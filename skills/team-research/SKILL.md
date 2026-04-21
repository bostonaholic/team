---
name: team-research
description: Research a codebase area before making changes. Dispatches parallel BLIND read-only agents (file-finder + researcher) that read the neutral brief and questions, never the original task. Trigger on "research this", "explore the codebase for", or "/team-research".
---

# TEAM Research — Standalone Phase

Run the RESEARCH phase only, then stop. Research is **blind** — the
researcher and file-finder never see the user's original task description.
They consume only `brief.md` and `questions.md` from the prior Question
phase.

## Input

Feature description: `$ARGUMENTS` (only used if no Question phase has run yet)

If `$ARGUMENTS` is empty AND no `~/.team/<topic>/events.jsonl` exists,
ask the user what to research and stop.

## Execution

1. Read `~/.team/<topic>/events.jsonl`. Scan for `task.captured`.
2. If not found: run `/team-question $ARGUMENTS` first to produce the
   Question artifacts.
3. Follow the event loop defined in `/team` (read `skills/team/registry.json`).
   This dispatches `file-finder` and `researcher` in parallel.
4. **Stop after `research.completed` is recorded** — do not continue to DESIGN.

## Completion

Report:
- Path to the research artifact
- Key findings (3-5 bullets)
- Open questions count
- Suggest: "/team-design to align on approach"
