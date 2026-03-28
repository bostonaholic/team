# TEAM: Task Execution Agent Mesh

A Claude Code plugin that orchestrates specialized agents to autonomously implement entire features end-to-end.

## Pipeline

```
RESEARCH → PLAN → TEST-FIRST → IMPLEMENT → VERIFY → SHIP
```

- **Research** — Parallel agents explore the codebase and document findings
- **Plan** — Create implementation plan with test list (user approves)
- **Test-First** — Write all acceptance tests; confirm they fail
- **Implement** — Execute plan step by step; make tests pass
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

See [docs/architecture.md](docs/architecture.md) for the full architecture including agent roster, skill definitions, hook descriptions, and state management.

## Components

- **11 agents** in `agents/` — specialized workers with model tiering (haiku/sonnet/opus)
- **14 skills** in `skills/` — methodology guides and slash command entry points
- **4 hooks** in `hooks/` — safety guards and compaction resilience
- **State** in `.team/state.json` — pipeline state with three-layer compaction defense
