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

Team runs **QRSPI** (Worktree-Question-Research-Design-Structure-Plan-Implement-PR). There are **no mid-run human gates**. An adversarial design review gates the Design (~200-line alignment doc), and the orchestrator records the verdicts to `design-review-<n>.md`. The human's checkpoint is the PR review at the end. The Structure (~2-page vertical-slice breakdown) is produced autonomously and advances to Plan with no approval wait. Research is **isolated**: the researcher reads only `questions.md`, never `task.md` or the user's framing. The Plan is a tactical artifact for the implementer, not for human review. Implement is a sub-pipeline (test-first → slice execution → 5-reviewer adversarial verify with hard-gate retry loop). The whole run is autonomous with mechanical gates.

## Entry points

| Command | Phase |
|---------|-------|
| `/team <desc>` | Full 8-phase QRSPI pipeline |
| `/team-fix <bug>` | Compressed bug-fix pipeline (no QRSPI ceremony) |
| `/team-worktree` | Leading WORKTREE phase: create the home worktree. In a full run it is automatic and first. Standalone, it consumes `plan.md` post-PLAN for manual recovery or multi-repo setup |
| `/team-question <desc>` | Decompose intent into task + questions + brief |
| `/team-research` | Isolated codebase research (runs Question if missing) |
| `/team-design` | Draft the design. An adversarial design review gates advancement |
| `/eng-design-doc-review` | Adversarial fresh-context audit of `design.md`. Its Review brief doubles as the pipeline's design-review gate, and standalone use remains |
| `/team-structure` | Break design into vertical slices (autonomous) |
| `/team-plan` | Tactical plan from the structure |
| `/team-implement` | Test-first + slice execution + 5-reviewer verify |
| `/team-pr` | Commit + open PR |

## Agents (13)

See `agents/*.md`. Each agent file uses only Claude Code's [supported frontmatter fields](https://code.claude.com/docs/en/agents#supported-frontmatter-fields) (no custom fields). Model tiering: haiku (mechanical), sonnet (bounded judgment), and opus by default for complex work (research, planning, test authoring, implementation, code review). `fable`, though more capable, is reserved for an agent with a demonstrated, concrete need that opus cannot meet — no agent meets that bar today. `security-reviewer` stays on opus permanently: Fable's cybersecurity classifiers refuse security-review content in non-interactive subagent contexts. See [docs/architecture.md](docs/architecture.md#model-tiering) for everything else: the fable prerequisites, the override escape hatch, and the re-pin bar. Effort tiering mirrors the model tiers: `low` (mechanical), `medium`/`high` (judgment), `xhigh` (strategic artifact authors: `design-author` and `structure-planner`). Methodology skills carry no `effort`. They inherit from the loading agent.

Four agents (`researcher`, `implementer`, `code-reviewer`, `security-reviewer`) hold the `Agent` tool and may spawn read-only nested sub-agents (Claude Code ≥ 2.1.172) under the guardrails in `skills/nested-agents/SKILL.md`. Nesting is an optimization with an inline fallback, invisible to the orchestrator. See [docs/architecture.md](docs/architecture.md#10-nested-sub-agents).

**Invariant:** the agent inventory in `skills/team/registry.json` (which carries the `phase` mapping) and the files under `agents/` must always agree by name. When adding or renaming an agent, update both in the same commit. The dev hook `.claude/hooks/check-registry-sync.mjs` enforces this automatically.

**Invariant (checks and balances):** producers write, reviewers judge, and no agent does both. A reviewer (`code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`) holds no `Write`/`Edit` tool and carries `permissionMode: plan`. A reviewer that can edit can fix what it found and then approve its own fix, which collapses the generator and the evaluator into one role. `tests/protocol.test.ts` enforces both halves. See [docs/architecture.md](docs/architecture.md#checks-and-balances).

## Skills (56)

See `skills/*/SKILL.md`. Entry point skills double as slash commands. Nine of them are standalone slash-command utilities that are not QRSPI phases. `shipit` lands a reviewed PR. `pr-open-comments` triages unresolved PR review feedback. `pr-watch-as-author` is a bounded PR review watch loop. `pr-watch-as-reviewer` is the reviewer-side watch-and-approve. `groom-backlog` grooms a project backlog with a board-level pass plus per-item promotion, and can close an issue whose premise evaporated — an irreversible public mutation, each close gated on its own per-issue approval. `pr-cleanup` tears down local and remote branch state after a PR is merged or abandoned. `pr-verify` verifies a PR's test plan with evidence-rated verdicts. `pr-rebase` rebases a branch onto its base, resolving conflicts and gating the force-push on a pre-rebase check baseline — user-invoked only (`disable-model-invocation: true`), on stated rebase intent, never on a branch merely being behind. `reflect` mines the invoking session's own transcript for durable learnings and turns the approved ones into skill edits and tracker issues — user-invoked only (`disable-model-invocation: true`), because a run rewrites `SKILL.md` files and files public issues. Methodology skills are loaded by agents. For design guidelines on skill extraction and load limits, see [`docs/architecture.md`](docs/architecture.md#design-guidelines).

## Hooks

**Runtime** (3, distributed with plugin):

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-compact-anchor.mjs` | PreCompact | Scan docs/plans/ for active topic, inject phase anchor before compaction |
| `session-start-recover.mjs` | SessionStart | Scan docs/plans/ for active topic, surface phase + suggested next command |
| `post-write-validate.mjs` | PostToolUse(Write\|Edit) | Structural validation of plugin files |

**Development** (in `.claude/hooks/`):

| Hook | Event | Purpose |
|------|-------|---------|
| `check-registry-sync.mjs` | PostToolUse(Write\|Edit) | Cross-check agent frontmatter against registry.json |
| `pre-merge-guard.mjs` | PreToolUse(Bash) | Deny `gh pr merge` when the version-bump invariant fails. Gates only a literal `gh pr merge` Bash tool call in a session that loaded `.claude/settings.json` — UI, raw-terminal, and wrapped merges bypass it (see [docs/versioning.md](docs/versioning.md)) |

## State

State is the set of artifacts in `docs/plans/<id>/*.md`, where `<id>` is `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Each artifact carries YAML frontmatter (`topic`, `date`, `phase`). `design.md` also carries `revision`, review verdicts live in `design-review-<n>.md`, and cross-model review dispositions (when the opt-in pass ran) in `cross-model-notes.md`, with raw design-round vendor transcripts in `cross-model-raw.md`. Live in-session coordination uses TodoWrite (session-scoped). Any `/team-*` command rebuilds the ledger by scanning artifacts on entry. See [docs/architecture.md section 9](docs/architecture.md#9-state-management) for the full compaction-defense explanation.

## Learned rules

- **No `commands/` directory.** Skills are the only entry point mechanism. They auto-register as slash commands.
- **No project-scoped memory.** Do not save memories to `~/.claude/projects/*/memory/`. All project knowledge belongs in this file or docs linked from here. This file is checked into git and travels with the project.
- **Todo-first progress tracking.** Any agent or skill that executes a multi-step numbered procedure seeds one TodoWrite item per step before starting and marks each complete as it goes. See `skills/progress-tracking/SKILL.md` for the convention and ledger-ownership rules.
- **A drafted PR carries no version. Nothing versions until the step immediately before the merge command.** Bullets accumulate under `## [Unreleased]`; the six version strings, the dated changelog section, and the `vX.Y.Z` PR-title prefix all stay untouched until that step. **"Land time" means exactly that moment, never "when the work is done"** — a version assigned at PR-open time is computed against a `main` that keeps moving, so it goes stale as soon as another PR lands and the pre-merge guard then denies the merge. Team versions itself through the dev `version-bump` skill, which fires **only on explicit land intent** and never on work merely looking landable, then lands through the generic `/shipit`. **The bump is also conditional on a runtime change, not universal:** only a PR that changes the **distributed plugin** (per the runtime-vs-development split above) bumps; a dev-only PR (CI, docs, tests, evals, `.claude/` tooling) lands with no bump, no changelog cut, and a plain conventional title. The deterministic gate `.github/scripts/version-bump-required.sh` (pinned by `tests/version-bump-required.test.ts`) states a *merge* precondition, so its exit 1 on an unbumped runtime branch is the expected state throughout review rather than a cue to bump; `version-bump` runs it early, and the pre-merge dev hook (`.claude/hooks/pre-merge-guard.mjs`) denies the merge command on either violation. Full land-time procedure: `.claude/skills/version-bump/SKILL.md` (Team's internal bumper) and `skills/shipit/SKILL.md` (project-agnostic, does no versioning). See [docs/versioning.md](docs/versioning.md).
- **Read docs/testing.md before writing any test.** Before adding or modifying ANY test (unit, tripwire, eval, fixture, or rubric), read [docs/testing.md](docs/testing.md) end to end and understand it. It decides *which layer* a check belongs at, so push every check as far down and as deterministic as it goes. It also decides if the check is free (`*.test.ts`) or paid (`*.evals.ts`), and if it gates or runs periodically. A test written at the wrong layer is worse than no test: it is slow, flaky, or costs money to learn nothing. No exceptions: this applies to agents, skills, and humans alike.

## Behavioral evals

Behavioral regression harness for pipeline agents, built on TypeScript + Bun. Harness code lives in `tests/`. Fixtures, rubrics, and stored runs live in `evals/`. `bun test` runs the free static gate. `bun run test:evals` runs the paid E2E and LLM-judge tiers (needs `EVALS_ANTHROPIC_API_KEY`). See [docs/testing.md](docs/testing.md) for the six-layer testing strategy (what each layer is and which files implement it) and [evals/README.md](evals/README.md) for the operator's guide.

## Work tracking

All work, including features, bugs, and chores, is tracked on the [GitHub Project board](https://github.com/users/bostonaholic/projects/5/views/1). It is the single source of truth. If work is not on the board, it is not tracked. Create a GitHub issue in `bostonaholic/team` and add it to the project. Then move its card across the kanban (**Backlog → Ready → In progress → In review → Done**) as the work progresses. See [docs/project-tracking.md](docs/project-tracking.md) for the full workflow.

**Every issue carries a `Priority`** (`P0`, `P1`, or `P2`), set when it is created. An unprioritized issue is untriaged. **Every `bug` is `P0`**, because bugs take precedence over features and enhancements. See [docs/project-tracking.md](docs/project-tracking.md#creating-work).
