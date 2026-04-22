# TEAM: Task Execution Agent Mesh

A Claude Code plugin that orchestrates specialized agents to autonomously implement entire features end-to-end, driven by an append-only event log and the **QRSPI** workflow.

## Design Philosophy

Agents are decoupled microservices. Each consumes events, does work, produces events. No agent knows about any other. The pipeline emerges from event flow — change it by editing `registry.json`, not the router.

## Pipeline (QRSPI)

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR
```

- **Question** — Decompose intent into a full task record, neutral research questions, and a sanitized brief. The questioner is the only agent that ever sees the user's original description.
- **Research** *(blind)* — Parallel agents (file-finder + researcher) consume only the brief and questions. They never see the task. This structurally prevents opinion-bias in research findings.
- **Design** *(human gate)* — Design author asks open questions interactively, then drafts a ~200-line alignment doc. Humans review here.
- **Structure** *(human gate)* — Break the design into vertical slices with verification checkpoints. Humans review the ~2-page structure here.
- **Plan** — Tactical implementation plan derived from the approved structure. Read by the implementer; not human-gated.
- **Worktree** — Router prepares an isolated git worktree.
- **Implement** — Test-first (test-architect writes failing tests, mechanical gate confirms) → slice execution (implementer commits each vertical slice atomically) → adversarial verification (5 parallel reviewers + typed hard-gate retry loop, max 5 rounds).
- **PR** — Update changelog, commit, open pull request, close beads issue.

## Usage

```
/team Add rate limiting middleware to all API endpoints
```

For well-understood bugs, skip the QRSPI ceremony:

```
/team-fix Users see stale cache after profile update
```

Or run individual phases:

```
/team-question Add rate limiting middleware to all API endpoints
/team-research
/team-design
/team-structure
/team-plan
/team-worktree
/team-implement
/team-pr
/team-resume
```

## Install

```
claude plugin add /path/to/team
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture and the `state.json` schema.

## Components

- **13 agents** in `agents/` — decoupled workers that read predecessor artifacts from `docs/plans/` and write their outputs there
- **15 entry-point + methodology skills** in `skills/` — slash commands and shared methodologies
- **4 hooks** in `hooks/` — safety guards and `state.json`-aware compaction resilience
- **1 shared library** at `lib/state.mjs` — pure state helpers (`readState`, `writeState`, `initState`)
- **1 registry** at `skills/team/registry.json` — agent inventory and event vocabulary (documentation only since the state.json migration)
- **State snapshot** at `~/.team/<topic>/state.json` — single source of pipeline state, plus `.approved` sidecar markers under `docs/plans/`
