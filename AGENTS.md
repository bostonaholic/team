# AGENTS.md — Project Router

> **This file is a table of contents, not an encyclopedia.**
> Keep it under ~150 lines. Point agents to references — do not embed content here.
> If guidance needs to exist, put it in `docs/` and link from here.

## What This Is

TEAM (Task Execution Agent Mesh) is a Claude Code plugin that orchestrates specialized agents to implement features end-to-end using an event-driven architecture. See [docs/architecture.md](docs/architecture.md) for the full design.

## Design Philosophy

Agents are **decoupled microservices**. Each consumes events, does work, produces events. No agent knows about any other. The pipeline emerges from event flow defined in `skills/team/registry.json`. See [docs/event-catalog.md](docs/event-catalog.md) for all events.

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
| `/team-implement` | Dispatch implementer agent |
| `/team-verify` | 5 parallel reviewers |
| `/team-ship` | Commit + PR |
| `/team-resume` | Replay event log, resume |

## Agents (12)

See `agents/*.md`. Each has `consumes`/`produces` in frontmatter. Model tiering: haiku (mechanical), sonnet (judgment), opus (planning + implementation).

**Invariant:** Agent frontmatter (`consumes`/`produces`) and `skills/team/registry.json` must always be in sync. When changing one, update the other in the same commit. The `post-write-validate` hook enforces this — it cross-checks all agents against the registry whenever either is edited.

## Skills (13)

See `skills/*/SKILL.md`. Entry point skills double as slash commands. Methodology skills are loaded by agents.

## Hooks (4)

See `hooks/*.mjs`. Pre-bash guard, compaction anchor/recovery (event-log aware), post-write validation.

## State

Event log at `.team/events.jsonl` (append-only, gitignored). State is derived from events, never stored directly. Three-layer compaction defense.

## Issue Tracking

This project uses **bd (beads)**. See [docs/beads-workflow.md](docs/beads-workflow.md) for rules, commands, and session completion protocol.
