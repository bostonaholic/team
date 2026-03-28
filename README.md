# TEAM: Task Execution Agent Mesh

A Claude Code plugin that orchestrates specialized agents to autonomously implement entire features end-to-end, driven by an append-only event log.

## Design Philosophy

Agents are decoupled microservices. Each consumes events, does work, produces events. No agent knows about any other. The pipeline emerges from event flow — change it by editing `registry.json`, not the router.

## Pipeline

```
feature.requested → research.completed → plan.drafted → plan.approved → tests.confirmed-failing → implementation.completed → verification.passed → feature.shipped
```

- **Research** — Parallel agents explore the codebase, produce findings
- **Plan** — Planner + adversarial critic create implementation plan (user approves)
- **Test-First** — Test architect writes all acceptance tests; confirmed failing
- **Implement** — Implementer agent executes plan step by step, makes tests pass
- **Verify** — 5 parallel reviewers (security is a hard gate)
- **Ship** — Commit, PR, merge

## Usage

```
/team Add rate limiting middleware to all API endpoints
```

Or run individual phases:

```
/team-research Explore the authentication system
/team-plan Plan the rate limiting implementation
/team-test
/team-implement
/team-verify
/team-ship
/team-resume
```

## Install

```
claude plugin add /path/to/team
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full event-driven architecture and [docs/event-catalog.md](docs/event-catalog.md) for the complete event reference.

## Components

- **12 agents** in `agents/` — decoupled workers with `consumes`/`produces` contracts
- **13 skills** in `skills/` — methodology guides and slash command entry points
- **4 hooks** in `hooks/` — safety guards and event-log-aware compaction resilience
- **1 registry** at `skills/team/registry.json` — the single source of pipeline wiring
- **Event log** at `.team/events.jsonl` — append-only state (derived, never stored)
