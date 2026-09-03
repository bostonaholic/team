# AGENTS.md: Project Router

> **This file is a table of contents, not an encyclopedia.**
> Keep it under ~150 lines. Point agents to references. Do not embed content here.
> If guidance needs to exist, put it in `docs/` and link from here.

## What this is

Team is a Claude Code plugin that orchestrates specialized agents to implement features end-to-end. The orchestrator (the main Claude Code session) walks a linear phase table, and persists state as artifact files in `docs/plans/<id>/`. That per-id directory carries YAML frontmatter with phase and revision metadata. The orchestrator coordinates live progress through TodoWrite. See [docs/architecture.md](docs/architecture.md) for the full design.

> **North star: read [docs/vision.md](docs/vision.md) and [docs/ethos.md](docs/ethos.md).** Team is a *loop-driven development system*: a human fills the Backlog and reviews finished work. Everything in between (groom → start → implement → open PR) runs autonomously. The ethos explains *why* the autonomous middle can be trusted. Every agent should understand this end state, which is the target the whole project moves toward.

## Runtime vs. development

This project produces a **distributed plugin**. Two contexts exist:

**Runtime** (`agents/`, `skills/`, `hooks/`, and the host manifests `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/`, and the root `plugin.json`) ships to end users. Fires when someone installs the Team plugin and runs `/team`. Changes here affect all users.

**Development** (`.claude/`) is our workspace tooling. Fires only when developing the plugin itself. Never distributed.

| Concern | Where it lives | Who runs it |
|---------|---------------|-------------|
| Pipeline agents, skills, hooks | `agents/`, `skills/`, `hooks/` | End users |
| Plugin manifests | `.claude-plugin/` (Claude Code), `.codex-plugin/` + `.agents/plugins/` (Codex), root `plugin.json` (Antigravity) | End users |
| Registry sync validation | `.claude/hooks/check-registry-sync.mjs` | Plugin developers |
| Pre-merge version gate | `.claude/hooks/pre-merge-guard.mjs` | Plugin developers |
| Dev acceptance scripts | `.claude/scripts/` | Plugin developers |
| Dev settings/hooks | `.claude/settings.json` | Plugin developers |
| Work tracking | [GitHub Project board](https://github.com/users/bostonaholic/projects/5/views/1) | Plugin developers |
| Behavioral regression harness | `tests/`, `evals/` | Plugin developers |
| Versioning & release automation | [docs/versioning.md](docs/versioning.md), `.claude/skills/version-bump/`, `.claude/scripts/next-version.sh`, `.github/workflows/` | Plugin developers |
| Dev install, per harness | `script/dev-install`/`dev-uninstall` (dispatch), `dev-install-<harness>` | Plugin developers |

**Rule of thumb:** If it validates that the plugin is *built correctly*, it is a dev concern (`.claude/`). If it runs *as part of the plugin's functionality*, it is runtime (`hooks/`).

## Design philosophy

Agents are **decoupled microservices**. Each consumes a predecessor artifact on disk, does work, and writes its output artifact to `docs/plans/` (with YAML frontmatter on every artifact). The orchestrator walks a linear phase table in `skills/team/SKILL.md`. `skills/team/registry.json` lists the 13 agents as a phase-tagged inventory.

## Pipeline

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR
```

Team runs **QRSPI** (Worktree-Question-Research-Design-Structure-Plan-Implement-PR). There are **no mid-run human gates**. An adversarial design review gates the Design (~200-line alignment doc), and the orchestrator records the verdicts to `design-review-<n>.md`. The human's checkpoint is the PR review at the end. The Structure (~2-page vertical-slice breakdown) is produced autonomously and advances to Plan with no approval wait. Research is **isolated**: the researcher reads only `2-questions.md`, never `1-task.md` or the user's framing. The Plan is a tactical artifact for the implementer, not for human review. Implement is a sub-pipeline (test-first → slice execution → 5-reviewer adversarial verify with hard-gate retry loop). The whole run is autonomous with mechanical gates.

## Entry points

| Command | Phase |
|---------|-------|
| `/team <ticket\|URL\|description>` | Start the full 8-phase QRSPI pipeline on stated pipeline intent |
| `/team resume <id> [--only <phase>]` | Resume one exact run; optionally run only its first incomplete phase |
| `/team-fix <bug>` | Compressed bug-fix pipeline (no QRSPI ceremony), on stated pipeline intent, never on a plain "fix this bug" |
| `/eng-design-doc-review` | Adversarial fresh-context audit of `6-design.md`. The front door over the `reviewing-designs` brief the pipeline's design-review gate also runs |

The eight `team-worktree` through `team-pr` skills are hidden internal modules.
Each receives one explicit artifact directory, runs one phase, and returns to
`team`; none is a slash command or chooses the next run/phase.

## Agents (13)

See `agents/*.md`. Each agent file uses only Claude Code's [supported frontmatter fields](https://code.claude.com/docs/en/agents#supported-frontmatter-fields) (no custom fields). Model tiering: haiku (mechanical), sonnet (bounded judgment), and opus by default for complex work (research, planning, test authoring, implementation, code review, security review). `fable` is the tier above opus, for an agent with a demonstrated, concrete need opus cannot meet; the tier is empty and `EXPECTED_MODELS` pins all thirteen, so setting one to fable fails the build. Never override `security-reviewer` up to fable — Fable's cybersecurity classifiers refuse security-review content in non-interactive subagent contexts — and never down off opus either. See [docs/architecture.md](docs/architecture.md#model-tiering) for everything else: the fable prerequisites, the override escape hatch, and the re-pin bar. Effort tracks the work on its own ladder: `low` (mechanical), `medium`/`high` (judgment — the band spans both), `xhigh` (strategic artifact authors: `design-author` and `structure-planner`). Methodology skills carry no `effort`. They inherit from the loading agent.

Four agents (`researcher`, `implementer`, `code-reviewer`, `security-reviewer`) hold the `Agent` tool and may spawn read-only nested sub-agents (Claude Code ≥ 2.1.172) under the guardrails in `skills/nested-agents/SKILL.md`. Nesting is an optimization with an inline fallback, invisible to the orchestrator. See [docs/architecture.md](docs/architecture.md#10-nested-sub-agents).

**Invariant:** the agent inventory in `skills/team/registry.json` (which carries the `phase` mapping) and the files under `agents/` must always agree by name. When adding or renaming an agent, update both in the same commit. The dev hook `.claude/hooks/check-registry-sync.mjs` enforces this automatically.

**Invariant (checks and balances):** producers write, reviewers judge, and no agent does both. A reviewer (`code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`) holds no `Write`/`Edit` tool and carries `permissionMode: plan`. A reviewer that can edit can fix what it found and then approve its own fix, which collapses the generator and the evaluator into one role. `tests/protocol.test.ts` enforces both halves. See [docs/architecture.md](docs/architecture.md#checks-and-balances).

## Skills

See `skills/*/SKILL.md`. Skills have four invocation classes: pipeline entry
points, hidden phase modules, standalone utilities, and methodologies.
All eight mutating utilities set `disable-model-invocation: true`.
`groom-backlog` requires `scan|promote`, `pr-cleanup` requires
`merged|abandon`, PR utilities require an explicit target, and `reflect` reads
only the invoking session. See [docs/skills.md](docs/skills.md).

## Hooks

**Runtime** (3, distributed with plugin):

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-compact-anchor.mjs` | PreCompact | Find newest active ID and inject `/team resume <id>` before compaction |
| `session-start-recover.mjs` | SessionStart | Find newest active ID and suggest `/team resume <id>` |
| `post-write-validate.mjs` | PostToolUse(Write\|Edit) | Structural validation of plugin files |

**Development** (in `.claude/hooks/`):

| Hook | Event | Purpose |
|------|-------|---------|
| `check-registry-sync.mjs` | PostToolUse(Write\|Edit) | Cross-check agent frontmatter against registry.json |
| `pre-merge-guard.mjs` | PreToolUse(Bash) | Deny `gh pr merge` when the version-bump invariant fails. Its reach is one surface: a literal `gh pr merge` Bash tool call in a session that loaded `.claude/settings.json`. Every other merge surface — UI, raw terminal, a wrapped call, another host — runs no version-bump check and shows no red signal for it (see [docs/versioning.md](docs/versioning.md)) |

## State

State is the artifacts in `docs/plans/<id>/`; there is no second state store.
`1-task.md` preserves start intent, `9-implementation.md` records reviewed HEADs,
and `10-pr.md` records opened drafts. TodoWrite is session-only. `/team resume
<id>` resolves that exact ID and rebuilds the ledger. Hooks may scan for the
newest active ID only to recommend the explicit resume command. See
[docs/architecture.md section 9](docs/architecture.md#9-state-management).

## Learned rules

- **No `commands/` directory.** User-invocable skills auto-register as slash commands; hidden skills are modules or methodology.
- **No project-scoped memory.** Do not save memories to `~/.claude/projects/*/memory/`. All project knowledge belongs in this file or docs linked from here. This file is checked into git and travels with the project.
- **Todo-first progress tracking.** Any agent or skill that executes a multi-step numbered procedure seeds one TodoWrite item per step before starting and marks each complete as it goes. See `skills/principle-progress-tracking/SKILL.md` for the convention and ledger-ownership rules.
- **A drafted PR carries no version. Nothing versions until the step immediately before the merge command.** Bullets accumulate under `## [Unreleased]`; the six version strings, the dated changelog section, and the `vX.Y.Z` PR-title prefix all stay untouched until that step. **"Land time" means exactly that moment, never "when the work is done"** — a version assigned at PR-open time is computed against a `main` that keeps moving, so it goes stale as soon as another PR lands and the pre-merge guard then denies the merge. Team versions itself through the dev `version-bump` skill, which fires **only on explicit land intent** and never on work merely looking landable, then lands through the generic `/shipit`. **The bump is also conditional on a runtime change, not universal:** only a PR that changes the **distributed plugin** (per the runtime-vs-development split above) bumps; a dev-only PR (CI, docs, tests, evals, `.claude/` tooling) lands with no bump, no changelog cut, and a plain conventional title. The deterministic gate `.github/scripts/version-bump-required.sh` (pinned by `tests/version-bump-required.test.ts`) states a *merge* precondition, so its exit 1 on an unbumped runtime branch is the expected state throughout review rather than a cue to bump; `version-bump` runs it early, and the pre-merge dev hook (`.claude/hooks/pre-merge-guard.mjs`) denies the merge command on either violation. Full land-time procedure: `.claude/skills/version-bump/SKILL.md` (Team's internal bumper) and `skills/shipit/SKILL.md` (project-agnostic, does no versioning). See [docs/versioning.md](docs/versioning.md).
- **Read docs/testing.md before writing any test.** Before adding or modifying ANY test (unit, tripwire, eval, fixture, or rubric), read [docs/testing.md](docs/testing.md) end to end and understand it. It decides *which layer* a check belongs at, so push every check as far down and as deterministic as it goes. It also decides if the check is free (`*.test.ts`) or paid (`*.evals.ts`), and if it gates or runs periodically. A test written at the wrong layer is worse than no test: it is slow, flaky, or costs money to learn nothing. No exceptions: this applies to agents, skills, and humans alike.

## Behavioral evals

Behavioral regression harness for pipeline agents, built on TypeScript + Bun. Harness code lives in `tests/`. Fixtures, rubrics, and stored runs live in `evals/`. `bun test` runs the free static gate. `bun run test:evals` runs the paid E2E and LLM-judge tiers (needs `EVALS_ANTHROPIC_API_KEY`). See [docs/testing.md](docs/testing.md) for the six-layer testing strategy (what each layer is and which files implement it) and [evals/README.md](evals/README.md) for the operator's guide.

## Work tracking

All work, including features, bugs, and chores, is tracked on the [GitHub Project board](https://github.com/users/bostonaholic/projects/5/views/1). It is the single source of truth. If work is not on the board, it is not tracked. Create a GitHub issue in `bostonaholic/team` and add it to the project. Then move its card across the kanban (**Backlog → Ready → In progress → In review → Done**) as the work progresses. See [docs/project-tracking.md](docs/project-tracking.md) for the full workflow.

**Every issue carries a `Priority`** (`P0`, `P1`, or `P2`), set when it is created. An unprioritized issue is untriaged. **Every `bug` is `P0`**, because bugs take precedence over features and enhancements. See [docs/project-tracking.md](docs/project-tracking.md#creating-work).
