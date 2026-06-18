# AGENTS.md — Project Router

> **This file is a table of contents, not an encyclopedia.**
> Keep it under ~150 lines. Point agents to references — do not embed content here.
> If guidance needs to exist, put it in `docs/` and link from here.

## What This Is

Team is a Claude Code plugin that orchestrates specialized agents to implement features end-to-end. The orchestrator (the main Claude Code session) walks a linear phase table, persisting state as artifact files in `docs/plans/<id>/` (per-id directory; with YAML frontmatter carrying phase, approval, and revision metadata) and coordinating live progress via TodoWrite. See [docs/architecture.md](docs/architecture.md) for the full design.

> **North star — read [docs/vision.md](docs/vision.md) and [docs/ethos.md](docs/ethos.md).** Team is a *loop-driven development system*: a human fills the Backlog and reviews finished work; everything in between (groom → start → implement → open PR) runs autonomously. The ethos explains *why* the autonomous middle can be trusted. Every agent should understand this end state — it is the target the whole project moves toward.

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
| Work tracking | [GitHub Project board](https://github.com/users/bostonaholic/projects/5/views/1) | Plugin developers |
| Behavioral regression harness | `tests/`, `evals/` | Plugin developers |
| Versioning & release automation | [docs/versioning.md](docs/versioning.md), `.claude/skills/version-bump/`, `.claude/scripts/next-version.sh`, `.github/workflows/` | Plugin developers |

**Rule of thumb:** If it validates that the plugin is *built correctly*, it's a dev concern (`.claude/`). If it runs *as part of the plugin's functionality*, it's runtime (`hooks/`).

## Design Philosophy

Agents are **decoupled microservices**. Each consumes a predecessor artifact on disk, does work, and writes its output artifact to `docs/plans/` (with YAML frontmatter on every artifact). The orchestrator walks a linear phase table in `skills/team/SKILL.md`; `skills/team/registry.json` lists the 13 agents as a phase-tagged inventory.

## Pipeline

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR
```

Team runs **QRSPI** (Worktree-Question-Research-Design-Structure-Plan-Implement-PR). One human gate: **Design approval** (~200-line alignment doc). The Structure (~2-page vertical-slice breakdown) is produced autonomously and advances to Plan with no approval wait. Research is **isolated** — the researcher reads only `questions.md`, never `task.md` or the user's framing. The Plan is a tactical artifact for the implementer, not for human review. Implement is a sub-pipeline (test-first → slice execution → 5-reviewer adversarial verify with hard-gate retry loop). Everything outside the design gate is autonomous with mechanical gates.

## Entry Points

| Command | Phase |
|---------|-------|
| `/team <desc>` | Full 8-phase QRSPI pipeline |
| `/team-fix <bug>` | Compressed bug-fix pipeline (no QRSPI ceremony) |
| `/team-worktree` | Leading WORKTREE phase — create the home worktree (in a full run, automatic & first; standalone, consumes `plan.md` post-PLAN for manual recovery / multi-repo setup) |
| `/team-question <desc>` | Decompose intent into task + questions + brief |
| `/team-research` | Isolated codebase research (runs Question if missing) |
| `/team-design` | Align with user on approach (human gate) |
| `/eng-design-doc-review` | *(optional)* Adversarial fresh-context audit of `design.md` before the human gate |
| `/team-structure` | Break design into vertical slices (autonomous) |
| `/team-plan` | Tactical plan from the structure |
| `/team-implement` | Test-first + slice execution + 5-reviewer verify |
| `/team-pr` | Commit + open PR |

## Agents (13)

See `agents/*.md`. Each agent file uses only Claude Code's [supported frontmatter fields](https://code.claude.com/docs/en/agents#supported-frontmatter-fields) (no custom fields). Model tiering: haiku (mechanical), sonnet (bounded judgment), and the most capable available model for complex work (research, planning, implementation, code review, security review). That model is currently opus — Fable 5 is the intended target but is temporarily suspended for all customers ([notice](https://www.anthropic.com/news/fable-mythos-access)). See [docs/architecture.md](docs/architecture.md#model-tiering) for the restoration path and overrides. Effort tiering mirrors the model tiers: `low` (mechanical), `medium`/`high` (judgment), `xhigh` (human-gate artifact authors). Methodology skills carry no `effort` — they inherit from the loading agent.

**Invariant:** the agent inventory in `skills/team/registry.json` (which carries the `phase` mapping) and the files under `agents/` must always agree by name. When adding or renaming an agent, update both in the same commit. The dev hook `.claude/hooks/check-registry-sync.mjs` enforces this automatically.

## Skills (30)

See `skills/*/SKILL.md`. Entry point skills double as slash commands; `shipit` is a standalone slash-command utility (land a reviewed PR) that is not a QRSPI phase. Methodology skills are loaded by agents. For design guidelines on skill extraction and load limits, see [`docs/architecture.md`](docs/architecture.md#design-guidelines).

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
- **Todo-first progress tracking.** Any agent or skill that executes a multi-step numbered procedure seeds one TodoWrite item per step before starting and marks each complete as it goes. See `skills/progress-tracking/SKILL.md` for the convention and ledger-ownership rules.
- **Team versions itself at land time via the dev `version-bump` skill, then lands via the generic `/shipit`.** A drafted PR carries no version, no `vX.Y.Z` title, and no released changelog section — it accumulates user-facing bullets under `## [Unreleased]`. To land a Team PR: (1) run the dev `version-bump` skill (`.claude/skills/version-bump/SKILL.md`) against current `main` — it assigns the next version, bumps the four version strings, cuts `[Unreleased]` into a dated `## [X.Y.Z]` section, sets the `vX.Y.Z <type>: <subject>` title, runs the land-time consistency assertion, and commits `chore(version)`; (2) run the distributed runtime `/shipit` skill (`skills/shipit/SKILL.md`) to push, wait for CI, and squash-merge. `shipit` is project-agnostic (it does no versioning); `version-bump` is Team's internal bumper. `release-on-merge.yml` then auto-tags and publishes from the landed `plugin.json`. See [docs/versioning.md](docs/versioning.md).
- **Read docs/testing.md before writing any test.** Before adding or modifying ANY test — unit, tripwire, eval, fixture, or rubric — read [docs/testing.md](docs/testing.md) end to end and understand it. It decides *which layer* a check belongs at (push every check as far down and as deterministic as it goes), whether it is free (`*.test.ts`) or paid (`*.evals.ts`), and whether it gates or runs periodically. A test written at the wrong layer is worse than no test: it is slow, flaky, or costs money to learn nothing. No exceptions — this applies to agents, skills, and humans alike.

## Behavioral Evals

Behavioral regression harness for pipeline agents — TypeScript + Bun. Harness code lives in `tests/`; fixtures, rubrics, and stored runs live in `evals/`. `bun test` runs the free static gate; `bun run test:evals` runs the paid E2E + LLM-judge tiers (needs `EVALS_ANTHROPIC_API_KEY`). See [docs/testing.md](docs/testing.md) for the six-layer testing strategy (what each layer is and which files implement it) and [evals/README.md](evals/README.md) for the operator's guide.

## Work Tracking

All work — features, bugs, chores — is tracked on the [GitHub Project board](https://github.com/users/bostonaholic/projects/5/views/1). It is the single source of truth: if work is not on the board, it is not tracked. Create a GitHub issue in `bostonaholic/team`, add it to the project, and move its card across the kanban (**Backlog → Ready → In progress → In review → Done**) as the work progresses. See [docs/project-tracking.md](docs/project-tracking.md) for the full workflow.

> The GitHub Project replaces the previous **bd (beads)** tracker. The `.beads/` directory remains for historical reference but is no longer the front door for new work.
