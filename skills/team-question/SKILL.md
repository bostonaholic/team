---
name: team-question
description: Decompose a feature description into the QRSPI Question phase artifacts (task, questions, brief). Replaces the old team-brainstorm. Trigger on "shape this idea", "decompose this task", or "/team-question".
---

# TEAM Question — Standalone Phase

Run the QUESTION phase only, then stop. The Question phase decomposes the
user's intent into three artifacts that the rest of the QRSPI pipeline
consumes: `task.md` (full intent, human-only), `questions.md` (neutral
research questions), and `brief.md` (sanitized codebase context).

## Input

Feature description: `$ARGUMENTS`

If `$ARGUMENTS` is empty, ask the user to describe what they want and stop.

## Execution

1. Derive a kebab-case `topic` and set `today` to `YYYY-MM-DD`.
2. Create `~/.team/<topic>/` and `docs/plans/` directories if needed.
3. If `~/.team/<topic>/state.json` already exists, load it and resume; else
   the router (`/team`) bootstraps it via `initState(topic, beadsId, today)`.
4. Follow the phase loop defined in `/team` — it dispatches the `questioner`
   to produce `task.md`, `questions.md`, `brief.md` in `docs/plans/`.
5. **Stop once the three Question artifacts exist on disk** — do not
   continue to RESEARCH.

## When to use

- The idea is vague and you want to see the questioner's framing before
  committing to research.
- You want to review and edit `task.md` / `questions.md` / `brief.md` by
  hand before research begins.
- You want to run multiple research passes against the same task without
  re-decomposing.

## Completion

Report:
- Path to `task.md`, `questions.md`, `brief.md`
- Topic slug
- Suggest: "/team-research to gather codebase facts"
