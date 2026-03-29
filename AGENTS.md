# AGENTS.md — Project Router

> **This file is a table of contents, not an encyclopedia.**
> Keep it under ~150 lines. Point agents to references — do not embed content here.
> If guidance needs to exist, put it in `docs/` and link from here.

## What This Is

TEAM (Task Execution Agent Mesh) is a Claude Code plugin that orchestrates specialized agents to implement features end-to-end using an event-driven architecture. See [docs/architecture.md](docs/architecture.md) for the full design.

## Runtime vs. Development

This project produces a **distributed plugin**. Two contexts exist:

**Runtime** (`agents/`, `skills/`, `hooks/`, `.claude-plugin/`) — ships to end users. Fires when someone installs the TEAM plugin and runs `/team`. Changes here affect all users.

**Development** (`.claude/`) — our workspace tooling. Fires only when developing the plugin itself. Never distributed.

| Concern | Where it lives | Who runs it |
|---------|---------------|-------------|
| Pipeline agents, skills, hooks | `agents/`, `skills/`, `hooks/` | End users |
| Plugin manifest | `.claude-plugin/plugin.json` | End users |
| Registry sync validation | `.claude/hooks/check-registry-sync.mjs` | Plugin developers |
| Dev settings/hooks | `.claude/settings.json` | Plugin developers |
| Issue tracking | `.beads/` | Plugin developers |

**Rule of thumb:** If it validates that the plugin is *built correctly*, it's a dev concern (`.claude/`). If it runs *as part of the plugin's functionality*, it's runtime (`hooks/`).

## Design Philosophy

Agents are **decoupled microservices**. Each consumes events, does work, produces events. No agent knows about any other. The pipeline emerges from event flow defined in `skills/team/registry.json`. See [docs/event-catalog.md](docs/event-catalog.md) for all events.

## Pipeline

```
[BRAINSTORM] → RESEARCH → PLAN → TEST-FIRST → IMPLEMENT → VERIFY → SHIP
```

Brainstorming is optional — use `/team-brainstorm` to shape vague ideas before committing to implementation. Single human gate at Plan approval. Everything else is autonomous with mechanical gates.

## Entry Points

| Command | Phase |
|---------|-------|
| `/team-brainstorm <idea>` | Optional pre-research brainstorming |
| `/team <desc>` | Full 6-phase pipeline |
| `/team-fix <bug>` | Compressed bug-fix pipeline (no research/plan) |
| `/team-research <desc>` | Research only |
| `/team-plan <desc>` | Plan (runs research if missing) |
| `/team-test` | Write failing acceptance tests |
| `/team-implement` | Dispatch implementer agent |
| `/team-verify` | 5 parallel reviewers |
| `/team-ship` | Commit + PR |
| `/team-resume` | Replay event log, resume |

## Agents (12)

See `agents/*.md`. Each has `consumes`/`produces` in frontmatter. Model tiering: haiku (mechanical), sonnet (judgment), opus (planning + implementation).

**Invariant:** Agent frontmatter (`consumes`/`produces`) and `skills/team/registry.json` must always be in sync. When changing one, update the other in the same commit. The dev hook `.claude/hooks/check-registry-sync.mjs` enforces this automatically.

## Skills (13)

See `skills/*/SKILL.md`. Entry point skills double as slash commands. Methodology skills are loaded by agents.

## Hooks

**Runtime** (4 — distributed with plugin):

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-bash-guard.mjs` | PreToolUse(Bash) | Block dangerous commands |
| `pre-compact-anchor.mjs` | PreCompact | Snapshot event log before compaction |
| `session-start-recover.mjs` | SessionStart | Recover pipeline from event log |
| `post-write-validate.mjs` | PostToolUse(Write\|Edit) | Structural validation of plugin files |

**Development** (in `.claude/hooks/`):

| Hook | Event | Purpose |
|------|-------|---------|
| `check-registry-sync.mjs` | PostToolUse(Write\|Edit) | Cross-check agent frontmatter against registry.json |

## State

Event log at `.team/events.jsonl` (append-only, gitignored). State is derived from events, never stored directly. Three-layer compaction defense.

## Learned Rules

- **No `commands/` directory.** Skills are the only entry point mechanism. They auto-register as slash commands.
- **No project-scoped memory.** Do not save memories to `~/.claude/projects/*/memory/`. All project knowledge belongs in this file or docs linked from here. This file is checked into git and travels with the project.

## Issue Tracking

This project uses **bd (beads)**. See [docs/beads-workflow.md](docs/beads-workflow.md) for rules, commands, and session completion protocol.
