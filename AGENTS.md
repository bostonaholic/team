# AGENTS.md — Project Router

> **This file is a table of contents, not an encyclopedia.**
> Keep it under ~150 lines. Point agents to references — do not embed content here.
> If guidance needs to exist, put it in `docs/` and link from here.

## What This Is

TEAM (Task Execution Agent Mesh) is a Claude Code plugin that orchestrates specialized agents to implement features end-to-end. The router walks a linear phase table driven by `~/.team/<topic>/state.json` plus artifact files under `docs/plans/`. See [docs/architecture.md](docs/architecture.md) for the full design.

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

Agents are **decoupled microservices**. Each consumes a predecessor artifact on disk, does work, and writes its output artifact to `docs/plans/`. The router walks a linear phase table in `skills/team/SKILL.md`; `skills/team/registry.json` lists the 13 agents as documentation.

## Pipeline

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR
```

TEAM runs **QRSPI** (Question-Research-Design-Structure-Plan-Worktree-Implement-PR). Two human gates: **Design approval** (~200-line alignment doc) and **Structure approval** (~2-page vertical-slice breakdown). Research is **blind** — the researcher never sees the user's original task description. The Plan is a tactical artifact for the implementer, not for human review. Implement is a sub-pipeline (test-first → slice execution → 5-reviewer adversarial verify with hard-gate retry loop). Everything outside the two human gates is autonomous with mechanical gates.

## Entry Points

| Command | Phase |
|---------|-------|
| `/team <desc>` | Full 8-phase QRSPI pipeline |
| `/team-fix <bug>` | Compressed bug-fix pipeline (no QRSPI ceremony) |
| `/team-question <desc>` | Decompose intent into task + questions + brief |
| `/team-research` | Blind codebase research (runs Question if missing) |
| `/team-design` | Align with user on approach (human gate) |
| `/team-structure` | Break design into vertical slices (human gate) |
| `/team-plan` | Tactical plan from approved structure |
| `/team-worktree` | Prepare isolated git worktree |
| `/team-implement` | Test-first + slice execution + 5-reviewer verify |
| `/team-pr` | Commit + open PR |
| `/team-resume` | Resume from state.json + docs/plans/ artifacts |

## Agents (13)

See `agents/*.md`. Each has `consumes`/`produces` in frontmatter. Model tiering: haiku (mechanical), sonnet (judgment), opus (planning + implementation).

**Invariant:** Agent frontmatter (`consumes`/`produces`) and `skills/team/registry.json` must always be in sync. When changing one, update the other in the same commit. The dev hook `.claude/hooks/check-registry-sync.mjs` enforces this automatically.

## Skills (24)

See `skills/*/SKILL.md`. Entry point skills double as slash commands. Methodology skills are loaded by agents. For design guidelines on skill extraction and load limits, see [`docs/architecture.md`](docs/architecture.md#design-guidelines).

## Hooks

**Runtime** (4 — distributed with plugin):

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-bash-guard.mjs` | PreToolUse(Bash) | Block dangerous commands |
| `pre-compact-anchor.mjs` | PreCompact | Inject state.json snapshot anchor before compaction |
| `session-start-recover.mjs` | SessionStart | Recover pipeline from state.json snapshot |
| `post-write-validate.mjs` | PostToolUse(Write\|Edit) | Structural validation of plugin files |

**Development** (in `.claude/hooks/`):

| Hook | Event | Purpose |
|------|-------|---------|
| `check-registry-sync.mjs` | PostToolUse(Write\|Edit) | Cross-check agent frontmatter against registry.json |

## State

State is a single `~/.team/<topic>/state.json` snapshot plus `.approved` sidecar markers in `docs/plans/`. The state helper lives at `lib/state.mjs` (pure functions: `readState`, `writeState`, `initState`). The PreCompact hook reads `state.json` directly and injects a 4-line anchor; no event-log replay. See [docs/architecture.md section 9](docs/architecture.md#9-state-management) for the full compaction-defense explanation.

## Learned Rules

- **No `commands/` directory.** Skills are the only entry point mechanism. They auto-register as slash commands.
- **No project-scoped memory.** Do not save memories to `~/.claude/projects/*/memory/`. All project knowledge belongs in this file or docs linked from here. This file is checked into git and travels with the project.

## Issue Tracking

This project uses **bd (beads)**. See [docs/beads-workflow.md](docs/beads-workflow.md) for rules, commands, and session completion protocol.
