# TEAM Architecture

> **Task Execution Agent Mesh** — A Claude Code plugin that orchestrates specialized agents to autonomously implement entire features end-to-end.

## Core Principles

- **Skills encode methodology** (when and why). **Agents are execution workers** (how).
- **Hooks enforce discipline mechanically** — LLMs forget instructions ~20% of the time; hooks are deterministic.
- **File artifacts are the communication protocol** between phases — they survive context compaction.
- **Single human gate** at plan approval. Everything else is autonomous with mechanical gates.

## Pipeline

```
RESEARCH ──> PLAN ──> TEST-FIRST ──> IMPLEMENT ──> VERIFY ──> SHIP
                ^                                      |        |
                └── deviation requiring re-plan ───────┘        |
                                          IMPLEMENT <── hard gate failure (max 3 retries)
```

### Phase 1: RESEARCH

Parallel read-only agents survey the codebase and document findings.

- **Agents:** `researcher` (1-3 parallel), `file-finder`
- **Output:** `docs/plans/YYYY-MM-DD-<topic>-research.md`
- **Gate:** Artifact exists on disk

### Phase 2: PLAN

Planner reads research, produces implementation plan. Plan-critic reviews adversarially. Product-owner resolves ambiguity if detected.

- **Agents:** `product-owner` (conditional), `planner`, `plan-critic`
- **Output:** `docs/plans/YYYY-MM-DD-<topic>-plan.md`, optional ADRs
- **Gate:** **HARD — User approves plan** (only human interaction in pipeline)

### Phase 3: TEST-FIRST

Test architect writes all acceptance tests from the approved plan. Tests are run to confirm they fail for the right reason. The test list becomes the immutable scope fence.

- **Agents:** `test-architect`
- **Output:** Test files, confirmed failing
- **Gate:** All tests exist and fail correctly

### Phase 4: IMPLEMENT

Orchestrator executes the plan step by step, making tests pass. State updated per step for compaction resilience.

- **Agents:** Main context (orchestrator)
- **Output:** Code, passing tests
- **Gate:** All acceptance tests pass

### Phase 5: VERIFY

Five parallel reviewers with fresh context (generator-evaluator separation).

- **Agents:** `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`
- **Gates:**
  - Security: **HARD** — critical findings block
  - Tests: **HARD** — must pass
  - Code review: **SOFT** — user sees, may proceed
  - UX review: **SOFT** — user sees, may proceed
  - Docs: **ADVISORY**
- **On hard gate failure:** Loop to IMPLEMENT (max 3 retries, then escalate)

### Phase 6: SHIP

Commit, create PR or merge. CI must pass.

- **Agents:** None required (orchestrator handles)
- **Output:** Merged PR

## Agents

| Agent | Model | Mode | Tools | Phase | Role |
|-------|-------|------|-------|-------|------|
| `file-finder` | haiku | plan | Read, Grep, Glob | Research | Locate relevant files |
| `researcher` | sonnet | plan | Read, Grep, Glob | Research | Codebase exploration |
| `product-owner` | sonnet | plan | Read, Grep, Glob | Plan | Resolve ambiguity |
| `planner` | opus | acceptEdits | Read, Write, Edit, Grep, Glob | Plan | Create plan |
| `plan-critic` | sonnet | plan | Read, Grep, Glob | Plan | Adversarial plan review |
| `test-architect` | inherit | acceptEdits | Read, Write, Edit, Grep, Glob, Bash | Test-First | Write failing tests |
| `code-reviewer` | sonnet | plan | Read, Grep, Glob, Bash | Verify | Quality (Conventional Comments) |
| `security-reviewer` | sonnet | plan | Read, Grep, Glob, Bash | Verify | OWASP security audit |
| `technical-writer` | sonnet | plan | Read, Grep, Glob, Bash | Verify | Doc gap analysis |
| `ux-reviewer` | sonnet | plan | Read, Grep, Glob, Bash | Verify | UX/API ergonomics |
| `verifier` | haiku | plan | Read, Grep, Glob, Bash | Verify | Lint, type, build, test |

**Model tiering:** haiku for mechanical, sonnet for judgment, opus for planning.

## Skills

### Entry Points (slash commands)

| Skill | Command | Description |
|-------|---------|-------------|
| `team` | `/team <desc>` | Full 6-phase pipeline |
| `team-research` | `/team-research <desc>` | Research only |
| `team-plan` | `/team-plan <desc>` | Plan (runs research if missing) |
| `team-test` | `/team-test` | Test-first (requires plan) |
| `team-implement` | `/team-implement` | Implement (requires plan + tests) |
| `team-verify` | `/team-verify` | Verify (requires implementation) |
| `team-ship` | `/team-ship` | Ship (requires verification) |
| `team-resume` | `/team-resume` | Resume from state file |

### Methodology (loaded by agents, not directly invoked)

| Skill | Description |
|-------|-------------|
| `rpi-workflow` | Phase discipline, artifact conventions, gate types |
| `test-first-development` | Acceptance tests as scope fence |
| `adversarial-review` | Generator-evaluator separation, review methodology |
| `systematic-debugging` | Root cause investigation |
| `documenting-decisions` | ADR creation and management |
| `state-management` | State file format, compaction recovery |

## Hooks

| Hook | Event | Purpose |
|------|-------|---------|
| `pre-bash-guard.mjs` | PreToolUse(Bash) | Block dangerous commands |
| `pre-compact-anchor.mjs` | PreCompact | Anchor pipeline state before compaction |
| `session-start-recover.mjs` | SessionStart | Resume pipeline after compaction |
| `post-write-validate.mjs` | PostToolUse(Write\|Edit) | Validate plugin structure |

## State Management

**File:** `.team/state.json` (gitignored)

```json
{
  "phase": "IMPLEMENT",
  "topic": "feature-name",
  "planPath": "docs/plans/YYYY-MM-DD-feature-name-plan.md",
  "researchPath": "docs/plans/YYYY-MM-DD-feature-name-research.md",
  "currentStep": "Phase 2 Step 2.1",
  "backwardTransitions": 0,
  "testFiles": [],
  "startedAt": "2026-03-28T14:30:00Z"
}
```

**Three-layer compaction defense:**
1. State file on disk (survives everything)
2. PreCompact hook injects state into compacted context
3. SessionStart hook recovers state after compaction
