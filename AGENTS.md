# AGENTS.md — Project Router

> **This file is a table of contents, not an encyclopedia.**
> Keep it under ~150 lines. Point agents to references — do not embed content here.
> If guidance needs to exist, put it in `docs/` and link from here.

## What This Is

Team is a Claude Code plugin that orchestrates specialized agents to implement features end-to-end. The orchestrator (the main Claude Code session) walks a linear phase table, persisting state as artifact files in `docs/plans/<id>/` (per-id directory; with YAML frontmatter carrying phase, approval, and revision metadata) and coordinating live progress via TodoWrite. See [docs/architecture.md](docs/architecture.md) for the full design.

## Runtime vs. Development

This project produces a **distributed plugin**. Two contexts exist:

**Runtime** (`agents/`, `skills/`, `hooks/`, `.claude-plugin/`) — ships to end users. Fires when someone installs the Team plugin and runs `/team`. Changes here affect all users.

**Development** (`.claude/`) — our workspace tooling. Fires only when developing the plugin itself. Never distributed.

| Concern | Where it lives | Who runs it |
|---------|---------------|-------------|
| Pipeline agents, skills, hooks | `agents/`, `skills/`, `hooks/` | End users |
| Plugin manifest | `.claude-plugin/plugin.json` | End users |
| Registry sync validation | `.claude/hooks/check-registry-sync.mjs` | Plugin developers |
| Dev acceptance scripts | `.claude/scripts/` | Plugin developers |
| Dev settings/hooks | `.claude/settings.json` | Plugin developers |
| Issue tracking | `.beads/` | Plugin developers |
| Behavioral regression harness | `tests/`, `evals/` | Plugin developers |

**Rule of thumb:** If it validates that the plugin is *built correctly*, it's a dev concern (`.claude/`). If it runs *as part of the plugin's functionality*, it's runtime (`hooks/`).

## Design Philosophy

Agents are **decoupled microservices**. Each consumes a predecessor artifact on disk, does work, and writes its output artifact to `docs/plans/` (with YAML frontmatter on every artifact). The orchestrator walks a linear phase table in `skills/team/SKILL.md`; `skills/team/registry.json` lists the 13 agents as a phase-tagged inventory.

## Pipeline

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR
```

Team runs **QRSPI** (Question-Research-Design-Structure-Plan-Worktree-Implement-PR). Two human gates: **Design approval** (~200-line alignment doc) and **Structure approval** (~2-page vertical-slice breakdown). Research is **isolated** — the researcher reads only `questions.md`, never `task.md` or the user's framing. The Plan is a tactical artifact for the implementer, not for human review. Implement is a sub-pipeline (test-first → slice execution → 5-reviewer adversarial verify with hard-gate retry loop). Everything outside the two human gates is autonomous with mechanical gates.

## Entry Points

| Command | Phase |
|---------|-------|
| `/team <desc>` | Full 8-phase QRSPI pipeline |
| `/team-fix <bug>` | Compressed bug-fix pipeline (no QRSPI ceremony) |
| `/team-question <desc>` | Decompose intent into task + questions + brief |
| `/team-research` | Isolated codebase research (runs Question if missing) |
| `/team-design` | Align with user on approach (human gate) |
| `/eng-design-doc-review` | *(optional)* Adversarial fresh-context audit of `design.md` before the human gate |
| `/team-structure` | Break design into vertical slices (human gate) |
| `/team-plan` | Tactical plan from approved structure |
| `/team-worktree` | Prepare isolated git worktree |
| `/team-implement` | Test-first + slice execution + 5-reviewer verify |
| `/team-pr` | Commit + open PR |

## Agents (13)

See `agents/*.md`. Each agent file uses only Claude Code's [supported frontmatter fields](https://code.claude.com/docs/en/agents#supported-frontmatter-fields) (no custom fields). Model tiering: haiku (mechanical), sonnet (judgment), opus (planning + implementation).

**Invariant:** the agent inventory in `skills/team/registry.json` (which carries the `phase` mapping) and the files under `agents/` must always agree by name. When adding or renaming an agent, update both in the same commit. The dev hook `.claude/hooks/check-registry-sync.mjs` enforces this automatically.

## Skills (28)

See `skills/*/SKILL.md`. Entry point skills double as slash commands. Methodology skills are loaded by agents. For design guidelines on skill extraction and load limits, see [`docs/architecture.md`](docs/architecture.md#design-guidelines).

## Hooks

**Runtime** (4 — distributed with plugin):

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-bash-guard.mjs` | PreToolUse(Bash) | Block dangerous commands |
| `pre-compact-anchor.mjs` | PreCompact | Scan docs/plans/ for active topic, inject phase anchor before compaction |
| `session-start-recover.mjs` | SessionStart | Scan docs/plans/ for active topic, surface phase + suggested next command |
| `post-write-validate.mjs` | PostToolUse(Write\|Edit) | Structural validation of plugin files |

**Development** (in `.claude/hooks/`):

| Hook | Event | Purpose |
|------|-------|---------|
| `check-registry-sync.mjs` | PostToolUse(Write\|Edit) | Cross-check agent frontmatter against registry.json |

## State

State is the set of artifacts in `docs/plans/<id>/*.md`, where `<id>` is `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Each artifact carries YAML frontmatter (`topic`, `date`, `phase`; gated artifacts also carry `approved`, `approved_at`, `revision`). Live in-session coordination uses TodoWrite (session-scoped); any `/team-*` command rebuilds the ledger by scanning artifacts on entry. See [docs/architecture.md section 9](docs/architecture.md#9-state-management) for the full compaction-defense explanation.

## Learned Rules

- **No `commands/` directory.** Skills are the only entry point mechanism. They auto-register as slash commands.
- **No project-scoped memory.** Do not save memories to `~/.claude/projects/*/memory/`. All project knowledge belongs in this file or docs linked from here. This file is checked into git and travels with the project.

## Behavioral Evals

Behavioral regression harness for pipeline agents — TypeScript + Bun. Harness code lives in `tests/`; fixtures, rubrics, and stored runs live in `evals/`. `bun test` runs the free static gate; `EVALS=1 bun test` runs the paid E2E + LLM-judge tiers. See [evals/README.md](evals/README.md).

## Issue Tracking

This project uses **bd (beads)**. Run `bd prime` for full workflow context and commands. After a fresh clone, run `bd hooks install` once to activate the git hooks that keep `.beads/issues.jsonl` in sync (the hook logic lives in `.beads/hooks/`; the `.git/hooks/` wrappers are local and not versioned).
