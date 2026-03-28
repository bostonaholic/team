# AGENTS.md — Project Router

> **This file is a table of contents, not an encyclopedia.**
> Keep it under ~150 lines. Point agents to references — do not embed content here.
> If guidance needs to exist, put it in `docs/` and link from here.

## What This Is

TEAM (Task Execution Agent Mesh) is a Claude Code plugin that orchestrates specialized agents to implement features end-to-end. See [docs/architecture.md](docs/architecture.md) for the full architecture.

## Pipeline

```
RESEARCH → PLAN → TEST-FIRST → IMPLEMENT → VERIFY → SHIP
```

Single human gate at Plan approval. Everything else is autonomous with mechanical gates.

## Entry Points

| Command | Phase |
|---------|-------|
| `/team <desc>` | Full 6-phase pipeline |
| `/team-research <desc>` | Research only |
| `/team-plan <desc>` | Plan (runs research if missing) |
| `/team-test` | Write failing acceptance tests |
| `/team-implement` | Implement (make tests pass) |
| `/team-verify` | 5 parallel reviewers |
| `/team-ship` | Commit + PR |
| `/team-resume` | Resume from `.team/state.json` |

## Agents (11)

See `agents/*.md` for definitions. Model tiering: haiku (mechanical), sonnet (judgment), opus (planning).

## Skills (14)

See `skills/*/SKILL.md`. Entry point skills double as slash commands. Methodology skills are loaded by agents.

## Hooks (4)

See `hooks/*.mjs`. Pre-bash guard, compaction anchor/recovery, post-write validation.

## State

Pipeline state at `.team/state.json` (gitignored). Three-layer compaction defense.

## Issue Tracking

This project uses **bd (beads)**. See [docs/beads-workflow.md](docs/beads-workflow.md) for rules, commands, and session completion protocol.
