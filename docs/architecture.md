---
title: Architecture
description: "Team plugin architecture — agents as microservices, the QRSPI pipeline, artifact frontmatter, and phase-inference rules."
audience: [user, developer]
nav_order: 4
nav_label: architecture
---

# Team Architecture

> **A deep dive into how Team is built.** Skim it for the mental model, or read
> it in full to contribute — the high-level pipeline overview lives on the
> [home page](index.md).
>
> **Source of truth:** the artifacts in `docs/plans/<id>/*.md` and the
> in-session TodoWrite ledger.

## Contents

- [1. Design Philosophy](#1-design-philosophy)
- [2. Artifact Layout & Frontmatter](#2-artifact-layout--frontmatter)
- [3. Pipeline (QRSPI)](#3-pipeline-qrspi)
- [4. Agent Roster](#4-agent-roster)
- [5. Phase-Table Orchestrator](#5-phase-table-orchestrator)
- [6. Skills](#6-skills)
- [7. Hooks](#7-hooks)
- [8. Behavioral Evals](#8-behavioral-evals)
- [9. State Management](#9-state-management)
- [10. Nested Sub-Agents](#10-nested-sub-agents)

## 1. Design Philosophy

Agents are **decoupled microservices**. Each agent consumes a predecessor
artifact on disk, does work, and produces its own artifact under
`docs/plans/<id>/`. The orchestrator is the main Claude Code session: it
walks a linear phase table, dispatches the right specialist for each phase,
seeds and updates a TodoWrite ledger, and runs the human gates.

**Principles:**

- **Files on disk are the durable record.** Every artifact under
  `docs/plans/<id>/` carries YAML frontmatter that describes its phase
  and, for human-gated phases, the approval state. Phase progression is
  inferred by scanning artifacts.
- **TodoWrite is the live coordination ledger.** It is session-scoped.
  Re-invoking any `/team-*` command rebuilds the ledger by scanning
  artifacts on entry.
- **Registry is a phase-tagged inventory.** `skills/team/registry.json`
  lists the 13 specialist agents and the QRSPI phase each serves. The
  orchestrator dispatches via the phase table in `skills/team/SKILL.md`,
  not via the registry.
- **File artifacts survive compaction.** Agents communicate through
  files in `docs/plans/<id>/`. These survive context-window compaction,
  can be re-read by any agent in any session, and live in git history.
- **Research isolation.** The researcher and file-finder never receive
  the user's original task description. Enforcement is two-layer:
  *structural* — the orchestrator only passes the `questions.md` path to
  the research agents; *procedural* — the research agents' system prompts
  forbid reading `task.md`.
- **One human touchpoint.** Design approval (~200-line alignment doc).
  Approval is recorded by flipping `approved: true` (and stamping
  `approved_at`) in the design's own YAML frontmatter — the artifact is
  self-describing. The Structure (~2-page vertical-slice breakdown) and
  the Plan are not human-gated; they advance autonomously. Design is the
  real contract.
- **Hooks enforce discipline mechanically.** LLMs forget instructions
  ~20% of the time; hooks are deterministic.

## 2. Artifact Layout & Frontmatter

All phase artifacts live in `docs/plans/<id>/`, where `<id>` is one of:

- **Ticket-prefixed**: `<TICKET>-<kebab-topic>` (e.g.,
  `ENG-1234-add-rate-limiting`)
- **Date-prefixed**: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
  `2026-05-01-add-rate-limiting`)

Every artifact opens with YAML frontmatter. Common fields:

```yaml
---
topic: <kebab-case>
date: 2026-04-30
phase: design        # task | questions | research | design | structure | plan
---
```

Per-phase additions:

| Phase     | Extra frontmatter                                                       |
|-----------|-------------------------------------------------------------------------|
| task      | `ticketId: <id>` (or `null`)                                            |
| questions | (none)                                                                  |
| research  | (none)                                                                  |
| design    | `approved: false`, `approved_at: null`, `revision: 0`                   |
| structure | (none — not human-gated; advances to PLAN once it exists)               |
| plan      | (none — derived mechanically from the structure)                        |

**Approval check** (used by downstream phase entry):

```sh
grep -qE '^approved:[[:space:]]*true[[:space:]]*$' <artifact>
```

**Approval flip** (orchestrator at human gate): edit the file in place to
set `approved: true` and stamp `approved_at: <ISO-8601>`.

**Rejection** (revision dispatch): the agent re-drafts the artifact. The
orchestrator increments `revision: <n+1>` in the new draft's frontmatter.
Cap at 5; beyond that, escalate to the user.

**Phase inference** (orchestrator + hooks):

| Latest artifact present                                | Current phase       |
|--------------------------------------------------------|---------------------|
| worktree exists for `<id>`, no `task.md` yet           | WORKTREE (next up)  |
| `task.md` + `questions.md` only                        | RESEARCH (next up)  |
| `research.md`                                          | DESIGN (next up)    |
| `design.md` (frontmatter `approved: false`)            | DESIGN (human gate) |
| `design.md` (frontmatter `approved: true`)             | STRUCTURE (next up) |
| `structure.md`                                         | PLAN (next up)      |
| `plan.md` + ≥1 commit on `<id>` since merge-base       | IMPLEMENT           |
| `plan.md` (no commit on `<id>` yet)                    | PLAN (next up)      |
| topic branch has slice commits + verifier passed       | PR (next up)        |
| PR opened or commit shipped                            | SHIPPED             |

Worktree presence: `git worktree list --porcelain | grep -q <id>`.
IMPLEMENT is confirmed only once there is **≥1 commit on `<id>` since
merge-base** with the default branch (`git log <merge-base>..<id>`
non-empty); `plan.md` present with no commit means the run is still
pre-IMPLEMENT.

## 3. Pipeline (QRSPI)

The pipeline has eight phases. The orchestrator walks them in order;
each phase requires the prior phase's artifact on disk.

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR → SHIPPED
```

### Phase 1: Worktree

**Action:** orchestrator-emit (the leading phase)
**Predecessor:** (none — description in `$ARGUMENTS`)

Before QUESTION, the orchestrator creates the home worktree on branch
`<id>` off `origin/HEAD` using Claude Code's native worktree support, and
authors `docs/plans/<id>/` **inside** it. Because the artifact directory
is born in the worktree, no copy is ever needed and the home checkout's
`git status` stays clean for the whole run. The orchestrator computes the
worktree's absolute path once and threads it into every downstream
dispatch (the main session does not `cd`).

**Single-repo (default):** `repos.md` is absent. One home worktree at
`<repo>/.claude/worktrees/<id>`.

**Multi-repo:** `repos.md` does not exist yet at this phase (the repo set
is confirmed during the design open-questions step), so only the home
worktree is created here. Secondary worktrees are created **after the
design gate**, one per listed repo:

```sh
git -C <repo-path> worktree add .claude/worktrees/<id> -b <id> origin/HEAD
```

At that point the orchestrator writes a `## Worktrees` section to
`repos.md`, back-recording the home worktree path plus each secondary
path, so any later `/team-*` invocation can rediscover all paths from one
file. Only the home repo's worktree carries `docs/plans/<id>/`; other
repos' worktrees do not duplicate the artifacts. See
`skills/worktree-isolation/SKILL.md` for full topology.

**Fallback:** if home-worktree creation fails (shallow clone, certain CI
systems, permissions), the orchestrator reports it and falls back to
in-place for the entire run — `docs/plans/<id>/` lives at the home-repo
root and the threaded path is the home-repo root.

### Phase 2: Question

**Agent:** `questioner`
**Predecessor:** worktree prepared (+ description in `$ARGUMENTS`)
**Artifacts:** `docs/plans/<id>/{task,questions}.md`

Decomposes the user's intent into two artifacts. Only the questioner
ever sees the user's description. There is no separate `brief.md`;
neutral codebase context lives in a "Codebase context" section at the top
of `questions.md`.

### Phase 3: Research

**Agents:** `file-finder` and `researcher` (parallel, isolated)
**Predecessor:** `questions.md` (orchestrator passes only the
`questions.md` path to the research agents)
**Artifact:** `docs/plans/<id>/research.md`

Orchestrator waits for both agents to return, then writes the combined
research artifact (with the required frontmatter).

### Phase 4: Design

**Agent:** `design-author` (MUST ask open questions interactively before
drafting)
**Predecessor:** `research.md`
**Artifact:** `docs/plans/<id>/design.md`
**Gate:** HUMAN — on approval the orchestrator edits `design.md`'s
frontmatter to set `approved: true` and `approved_at: <ISO-8601>`; on
rejection the agent re-drafts and increments `revision`.

### Phase 5: Structure

**Agent:** `structure-planner`
**Predecessor:** `design.md` with frontmatter `approved: true`
**Artifact:** `docs/plans/<id>/structure.md`
**Gate:** NONE — autonomous. Once `structure.md` exists the pipeline
advances to PLAN; design is the only human gate.

### Phase 6: Plan

**Agent:** `planner`
**Predecessor:** `structure.md`
**Artifact:** `docs/plans/<id>/plan.md`

No human gate. The plan is mechanically derived from the structure.

### Phase 7: Implement

**Sub-pipeline:**
1. **Test-first** — `test-architect` writes failing acceptance tests.
2. **Mechanical gate** — orchestrator runs the suite; all tests must
   fail with assertion errors, not crashes.
3. **Slice execution** — `implementer` works through the plan one slice
   at a time, committing each atomically.
4. **Code review** — 5 reviewers in parallel: `code-reviewer`,
   `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`.
5. **Aggregate gate** — orchestrator sorts every finding into a severity
   tier (**Blocking / Major / Minor-and-below**; see
   `skills/code-review/SKILL.md`). While any Blocking or Major finding
   remains, it dispatches the implementer to fix the typed failure
   class and re-runs all 5 reviewers — automatically, never consulting
   the user (the *consult guard*). Cap at 5 rounds; beyond that,
   escalate. Once Blocking and Major are clean, any remaining
   Minor-and-below findings are presented to the user, who decides.

The orchestrator tracks the round count by appending "Review round N"
items to the TodoWrite ledger.

### Phase 8: PR

**Action:** orchestrator-emit
**Predecessor:** aggregate gate passed

Update CHANGELOG.md (filter for user-facing commits since last release),
push the branch and open a draft PR automatically (`gh pr create
--draft` — the PR phase is not a human gate, so it needs no approval),
and surface the tracking ticket (if `task.md` carries `ticketId`). The
worktree stays in place after the PR opens — teardown is deferred until
the PR merges or the user asks, so the branch remains available for
iteration.

## 4. Agent Roster

13 specialist agents, organized by phase:

| Phase     | Agents                                                                            |
|-----------|-----------------------------------------------------------------------------------|
| QUESTION  | `questioner`                                                                      |
| RESEARCH  | `file-finder`, `researcher` (parallel)                                            |
| DESIGN    | `design-author`                                                                   |
| STRUCTURE | `structure-planner`                                                               |
| PLAN      | `planner`                                                                         |
| IMPLEMENT | `test-architect`, `implementer`, `code-reviewer`, `security-reviewer`,            |
|           | `technical-writer`, `ux-reviewer`, `verifier` (last 5 parallel)                   |

Each agent's QRSPI phase is recorded in `skills/team/registry.json`.
Agent frontmatter uses only Claude Code's [supported fields](https://code.claude.com/docs/en/agents#supported-frontmatter-fields).
The dev hook `.claude/hooks/check-registry-sync.mjs` validates that
the inventory in registry.json and the files under `agents/` agree by
name.

### Model tiering

The principle: **complex work runs on the most capable available
model; bounded judgment on `sonnet`; mechanical checks on `haiku`.**

The most capable model is currently `opus` (Opus 4.8). Fable 5 was the
intended complex-work model, but it is **temporarily suspended for all
customers** under a U.S. government export-control directive (see
[Anthropic's notice](https://www.anthropic.com/news/fable-mythos-access)).
Until access is restored, complex work runs on `opus`, the documented
fallback target for Fable and Anthropic's most capable Opus-tier model.

- **`opus` — complex work:** `researcher`, `design-author`,
  `structure-planner`, `planner`, `implementer`, `code-reviewer`, and
  `security-reviewer`.
- **`sonnet` — bounded single-pass judgment:** `questioner`,
  `ux-reviewer`, `technical-writer`.
- **`haiku` — mechanical checks:** `file-finder`, `verifier`.
- **`inherit`:** `test-architect` follows the session model.

Notes:

- **1M context window comes for free at the opus tier.** Opus 4.8
  always runs with the 1M window on the Anthropic API, and
  Max/Team/Enterprise plans include the 1M upgrade with the
  subscription (Pro degrades gracefully to 200K) — so the opus agents
  need no `[1m]` suffix. The sonnet agents stay at 200K (bounded
  single-pass work, nowhere near the ceiling); haiku does not support
  1M.
- **When Fable access is restored**, flip the complex-work agents from
  `opus` to `fable` — *except* `security-reviewer`, which stays on
  `opus` permanently: Fable 5's cybersecurity safety classifiers flag
  security-review content, and in non-interactive subagent contexts a
  flagged request ends the turn with a refusal instead of falling
  back. Fable requires Claude Code ≥ v2.1.170 and Fable access (not
  available under zero data retention; pin `ANTHROPIC_DEFAULT_FABLE_MODEL`
  on Bedrock/Vertex/Foundry).
- Users can override any agent's model with `CLAUDE_CODE_SUBAGENT_MODEL`
  (applies to all subagents), or copy an agent file into
  `.claude/agents/` with a different `model:`.

- Four agents — `researcher`, `implementer`, `code-reviewer`,
  `security-reviewer` — additionally hold the `Agent` tool and may spawn
  read-only nested sub-agents. See [10. Nested Sub-Agents](#10-nested-sub-agents).

### Effort tiering

Effort tiering mirrors the model tiers: `low` (mechanical),
`medium`/`high` (judgment), `xhigh` (human-gate artifact authors).
Methodology skills carry no `effort` — they inherit from the loading
agent.

## 5. Phase-Table Orchestrator

The orchestrator (the main Claude Code session) drives `/team` by
walking the phase table in `skills/team/SKILL.md`. Pseudocode:

```
setup:
  resolve $ARGUMENTS (issue URL → gh issue view; ticket → use as prefix).
  derive <id> = "<TICKET>-<topic>" or "<YYYY-MM-DD>-<topic>".
  create docs/plans/<id>/ if needed.
  seed TodoWrite ledger with one item per phase.
  on resume: scan docs/plans/<id>/, fast-forward the ledger.

loop:
  1. Inspect TodoWrite. If all phases completed → exit.
  2. Identify the in_progress phase. Look up agent(s) and predecessor
     artifact path(s) in the phase table.
  3. Verify predecessors exist on disk and (for human-gated phases)
     carry `approved: true` in frontmatter. If missing → desync;
     suggest re-invoking the bare /team-* command — its three-tier
     discovery resolves docs/plans/<id>/ without an explicit arg.
  4. Dispatch the agent(s) — pass them the artifact directory
     `docs/plans/<id>/`.
  5. Write returned artifacts to docs/plans/<id>/<name>.md with the
     YAML frontmatter the agent specifies.
  6. Run the gate for this phase (HUMAN | MECHANICAL | ORCHESTRATOR-EMIT
     | AGGREGATE).
  7. Mark current TodoWrite item complete and the next one in_progress.
  8. Goto loop.
```

## 6. Skills

Skills live under `skills/`. There are two flavors:

### Entry-point skills (slash commands)

Every entry-point skill carries an `argument-hint` field in its
frontmatter (Claude Code [skills frontmatter](https://code.claude.com/docs/en/skills#frontmatter-reference))
that documents the expected `$ARGUMENTS` shape.

Each downstream skill (`team-research` and beyond) treats `$ARGUMENTS` as
an artifact directory — typically the path printed by the previous
phase's completion message. For the 8 directory-consuming skills
(`team-research`, `team-design`, `team-structure`, `team-plan`,
`team-worktree`, `team-implement`, `team-pr`, `eng-design-doc-review`)
the `docs/plans/<id>/` argument is **optional**: each resolves the
directory through a three-tier chain — explicit `$ARGUMENTS` →
newest-mtime convention discovery (filtering by `ID_RE` / `PHASE_FILES`,
ported from `hooks/session-start-recover.mjs` as a POSIX ERE
translation, and the skill's required predecessor artifact) →
`AskUserQuestion` (called by the orchestrator/entry-point skill itself —
not by a subagent; subagents use the `agent-open-questions` envelope
protocol instead). Standalone modes still exist: a partial skill invoked
with no resolvable directory (or with a free-form description) bootstraps
the missing upstream artifacts inline rather than hard-erroring.

**Discovery extraction.** Each archetype-A skill resolves its working
directory by calling one shared script,
`skills/qrspi-workflow/discover-topic.sh`, invoked via
`${CLAUDE_PLUGIN_ROOT}` (the same convention the hooks and the
nested-agents helper use). The script is the single source of truth for
the three-tier resolver; it scans `docs/plans/` relative to the agent's
cwd in one self-contained invocation (agent threads reset cwd between Bash
calls, so it relies on no shared shell state). Its behavior, and the sync
of its `ID_RE` / `PHASE_FILES` with the hook lib's `findActiveTopic`, are
pinned by the L3 + drift-tripwire tests in `tests/discover-topic.test.ts`,
gated on every PR. This replaces the earlier design in which the ~6
load-bearing lines (`ID_RE`, `PHASE_FILES`, root literal, predecessor
filter) were duplicated verbatim across the eight directory-consuming
skills and kept in lock-step by a byte-identity gate. The JS side has the
same shape: the two runtime hooks (`session-start-recover.mjs`,
`pre-compact-anchor.mjs`) now share one `findActiveTopic` / `inferPhase`
implementation in `hooks/lib/pipeline-state.mjs` (unit-tested in
`tests/pipeline-state.test.ts`), and the drift tripwire keeps that single
JS source in sync with the bash script.

### Methodology skills (loaded by agents, not directly invoked)

Methodology skills carry no `argument-hint` and are loaded by agents
through one of two mechanisms: a `skills:` YAML list in the agent's
frontmatter (for example, `agents/design-author.md` declares
`skills: [product-thinking]`), or an inline prose load instruction in the
agent body (for example, `code-review` is loaded by the `code-reviewer`
agent).

Because they are reference material rather than user actions, methodology
skills set `user-invocable: false` in their frontmatter. This keeps them
out of the `/` slash-command menu (a `/qrspi-workflow` command is
meaningless to a user) while leaving them fully loadable by their two
mechanisms above — neither the `skills:` preload nor a by-path load is
affected by the field, which governs only menu visibility. The model can
still auto-load a methodology skill when relevant, so `disable-model-invocation`
is deliberately **not** set. When adding a new methodology skill, set
`user-invocable: false`; when adding a new entry-point skill, leave it
unset so it registers as a slash command.

Among methodology skills, `code-review` is the only one kept
user-invocable: it is both a building block (loaded as working methodology
by the `code-reviewer`, `security-reviewer`, `ux-reviewer`, and
`technical-writer` agents) **and** a meaningful standalone user action
("review this diff"), so the field stays unset. The distinction is the
*primary* surface: a skill earns a slash command when a user would
plausibly run it directly, even if agents also compose it.

(This is separate from the entry-point skills, which are user-invocable by
definition. Some of those — e.g. `team-worktree`, `team-pr` — are also
*referenced by path* from `team/SKILL.md`, but those are procedural
cross-links in the orchestrator's prose, not a parent loading the skill as
a building block. `code-review` is the only skill loaded as composed
methodology that is also a user command.)

For the full per-skill reference — all 31 skills, their arguments,
consumers, and behaviors — see [skills.md](skills.md).

### Design Guidelines

1. **Methodology skill load limit:** Soft limit of 3 methodology skills
   per agent invocation. At ~143 lines average per skill, 3 skills add
   ~430 lines (~6K-10K tokens, under 6% of 200K context). A fourth
   skill signals the agent's responsibility may be too broad. This is a
   design convention, not a hard constraint.

2. **Extraction threshold:** Extract methodology to a separate skill
   file when it forms a coherent, independently maintainable body of
   knowledge — regardless of consumer count. Extraction is justified by
   swappability, independent versioning, and file size (inlining would
   meaningfully grow the consuming file). Do not require 2+ consumers
   as a prerequisite. The threshold is about cohesion and
   maintainability, not reuse count.

## 7. Hooks

Runtime hooks (`hooks/` — distributed with the plugin):

| Hook                       | Event                    | Purpose                                                    |
|----------------------------|--------------------------|------------------------------------------------------------|
| `pre-bash-guard.mjs`       | PreToolUse(Bash)         | Block dangerous shell commands                             |
| `pre-compact-anchor.mjs`   | PreCompact               | Scan docs/plans/<id>/ for active topic; inject 4-line anchor |
| `session-start-recover.mjs`| SessionStart             | Scan docs/plans/<id>/ for active topic; emit recovery notice |
| `post-write-validate.mjs`  | PostToolUse(Write\|Edit) | Structural validation of plugin component files            |

Both `pre-compact-anchor.mjs` and `session-start-recover.mjs` work the
same way: list `docs/plans/*/` directories, pick the most recent
artifact directory by mtime of any contained artifact, infer the
current phase from artifact presence + frontmatter, and emit a short
context message naming the phase, `<id>`, and the suggested next
`/team-*` command. Both are stateless, exit 0 on any error, and return
within the 5000ms hook budget.

Development hook (`.claude/hooks/` — not distributed):

| Hook                     | Event                    | Purpose                                                              |
|--------------------------|--------------------------|----------------------------------------------------------------------|
| `check-registry-sync.mjs`| PostToolUse(Write\|Edit) | Verify the agents/ directory and registry.json agree by agent name   |

Development scripts (`.claude/scripts/` — not distributed) house dev-only
acceptance tooling run by plugin developers. (The former
`check-discovery-consistency.sh` gate was retired when the three-tier discovery
logic was extracted into the distributed, separately-tested
`skills/qrspi-workflow/discover-topic.sh`; its behavior is now pinned by
`tests/discover-topic.test.ts`, and the research-isolation invariant by
`tests/protocol.test.ts`.)

## 8. Behavioral Evals

The behavioral regression harness defends pipeline agents against silent
behavior drift across model upgrades. The implementation is TypeScript +
Bun: harness code in `tests/`, fixtures/rubrics/results in `evals/`.
Plugin-developer tooling — not distributed with the plugin. Three tiers:

- **Gate** (free) — `bun test`. Static schema validation on every
  fixture and rubric plus unit tests for the harness helpers. No model
  calls, no `EVALS_ANTHROPIC_API_KEY`. Runs in CI on every PR.
- **E2E** (paid) — `bun run test:evals` (needs `EVALS_ANTHROPIC_API_KEY`). Spawns `claude -p --output-format
  stream-json` against a fixture, parses the NDJSON transcript, persists
  a per-case result JSON with timing axes (`firstResponseMs`,
  `maxInterTurnMs`).
- **LLM-judge** (paid) — deterministic-first regex / ground-truth checks
  run cheap and gate the LLM call. Haiku for narrow rubrics, Sonnet for
  nuanced ones. Untrusted agent output is wrapped in
  `<<<UNTRUSTED_OUTPUT>>>` delimiters before reaching the judge.

`EvalCollector` writes incrementally, finds the previous run on the same
branch+tier, and prints regressions + budget regressions (≥2× growth in
tool calls or turns without a verdict change). See
[evals/README.md](https://github.com/bostonaholic/team/blob/main/evals/README.md) for fixture schema, rubric format,
env-var knobs, and the rerun-on-base blame protocol.

**CI wiring.** Two GitHub Actions workflows in `.github/workflows/`:
`harness-checks.yml` runs the offline harness validation on every PR
(no secrets, ~5s); `periodic-evals.yml` runs the live-agent regression
check on a weekly cron (Monday 06:00 UTC) with `EVALS_ANTHROPIC_API_KEY`.
That key is an **environment secret** scoped to the `evals` GitHub
Environment — a one-time Settings → Environments setup (create the `evals`
environment, attach the secret, optionally set required reviewers / a
main-only branch restriction). If the PR-eval workflow (`pr-evals.yml`) is
active, the `evals` environment must **not** restrict deployment branches to
`main` — PR head/merge refs are not `main`, so a main-only policy blocks the
secret on PRs and every gated eval fails at the deploy gate. Remove it via
Settings → Environments → evals → Deployment branches → "No restriction", or
`gh api -X DELETE repos/bostonaholic/team/environments/evals/deployment-branch-policies/<id>`.
The job declares `environment: evals` and
**fails closed** if the environment is absent: the secret simply resolves
to empty, so no token spend leaks. `pull_request_target` is hard-banned for
this and any secret-consuming / `claude`-spawning job — it runs in
base-repo context with secrets available, a base-repo-context exfiltration
vector — and the ban is enforced by a static tripwire in
`tests/static-gate.test.ts`. Live jobs that run on `pull_request` events
additionally gate on PR-author trust: only OWNER/MEMBER/COLLABORATOR authors
may spend tokens, so untrusted PRs (forks, Dependabot, first-time
contributors) never trigger paid execution.

These three tiers are the paid frontier of Team's broader six-layer testing
model — see [Testing](testing.md) for where every check belongs.

## 9. State Management

**Primary state:** the artifacts in `docs/plans/<id>/*.md`. Each
artifact's YAML frontmatter is the source of truth for "did this phase
finish?" and "was the human gate passed?"

**Live coordination:** TodoWrite (session-scoped). The orchestrator
seeds the ledger at the start of `/team`, marks each item `in_progress`
when dispatching, and `completed` when the artifact lands. Any `/team-*`
command rebuilds the ledger by scanning artifacts on entry, so an
interrupted run can be resumed by re-invoking any of them bare — discovery
auto-resolves the artifact directory (an explicit `docs/plans/<id>/` is still
accepted).

**Approval markers:** the gated artifact's own YAML frontmatter
(`approved: true`, `approved_at: <ISO-8601>`) records human gate passes
durably. The artifact is self-describing.

**Compaction defense:** the PreCompact hook scans `docs/plans/<id>/`
directories for the active topic and injects a 4-line anchor (phase,
`<id>`, suggested next `/team-*` command). The SessionStart hook does
the same for new sessions.

**Artifact persistence:** during a run, files in `docs/plans/<id>/` live on
disk in the worktree's working tree and **the pipeline never commits them** —
that discipline is what lets the commit-based IMPLEMENT signal (≥1 commit on
`<id>` since the default-branch merge-base) distinguish "implementation has
begun" from "artifacts merely exist": any commit on `<id>` is therefore a
code/slice commit, never an artifact commit. (A finished plan directory may
later be committed in its feature PR — that is outside the run.) Persistence
across sessions, compaction events, and context resets comes from the
worktree's files surviving, not from git history. They remain the durable
communication protocol between agents and the source of truth for "did phase
N finish?"

## 10. Nested Sub-Agents

Claude Code v2.1.172 lets sub-agents spawn their own sub-agents (up to
5 levels deep). The plugin uses this capability in exactly two patterns,
both governed by `skills/nested-agents/SKILL.md`:

- **Context-economy scouts** (`researcher`, `implementer`): read-only
  `Explore` / `team:file-finder` helpers that absorb bulk reading the
  parent would otherwise hold in its own context without ever
  referencing it again. The researcher's scouts inherit the research
  isolation invariant — scout prompts are built only from verbatim
  `questions.md` text and `repos.md` paths.
- **Skeptic verification** (`code-reviewer`, `security-reviewer`): each
  hard-gate finding (Blocking / CRITICAL / HIGH) is handed to a fresh
  `general-purpose` sub-agent as a neutral, falsifiable claim — never
  the reviewer's verdict or severity — with instructions to refute it.
  Default-keep: a finding is dropped only on an evidence-backed
  refutation the reviewer verifies itself. A false hard-gate finding
  costs an entire review round (implementer re-dispatch + all 5
  reviewers re-run), so the pass pays for itself.

**Policy:**

- The `Agent` tool is granted to exactly four agents: `researcher`,
  `implementer`, `code-reviewer`, `security-reviewer`. The allowlist is
  pinned by `tests/nested-agents.test.ts` — any other agent gaining the
  tool must be a deliberate decision that updates the tripwire.
- Nested helpers are read-only, never write under `docs/plans/`, and
  never emit open-questions envelopes (the envelope protocol is one
  level deep — see `skills/agent-open-questions/SKILL.md`).
- Depth budget: pipeline agents sit at depth 2 of 5 and may spawn at
  most one more level.
- **Version-gated.** Nesting requires Claude Code >= 2.1.172. The
  universal gate is `Agent`-tool presence — the platform withholds the
  tool from sub-agents below that floor, so an agent that lacks `Agent`
  (or any read-only agent like `researcher` that has no `Bash`) simply
  works inline. Agents that also hold `Bash` additionally run the bundled
  deterministic check `skills/nested-agents/supports-nesting.mjs
  "$(claude --version)"` (pure comparison core unit-tested at L1; skill
  contract and version floor pinned by `tests/nested-agents.test.ts`).
  The check is fail-closed — an older release, unrecognizable version
  output, or an environment where it cannot run all resolve to
  "unsupported," routing the agent to its inline path.
- **Optimization, never a dependency.** Every nested-dispatch section is
  optional with a mandatory inline fallback. On Claude Code versions
  without nesting, the plugin degrades to exactly its previous behavior.
  Nesting is invisible to the orchestrator: no phase-table, gate, or
  artifact contract depends on it.

### Future work (ship-later)

Recorded here so the next capability step is deliberate, not improvised.
Prerequisite for all items: nesting survives 2–3 Claude Code releases
without breaking changes, parallel dispatch semantics for nested
children are confirmed, and the depth cap is stable.

- **Verify-coordinator** (strongest candidate): an IMPLEMENT-phase
  coordinator that owns the 5-reviewer fan-out + aggregate gate + typed
  failure retry loop, returning a compact terminal verdict
  (`{verdict: PASS | CONDITIONAL | ESCALATE, rounds, findings[]}`) for
  the orchestrator to render. This keeps up to 25 reviewer reports out
  of the orchestrator's long-lived context. Needs: a terminal-verdict
  envelope protocol (sibling of agent-open-questions — the consult
  guard means no mid-loop user interaction exists to forward), and
  per-round state artifacts (`docs/plans/<id>/review/round-<n>.md`)
  to replace live TodoWrite round visibility and survive coordinator
  death.
- **Research-coordinator**: only if multi-repo research outgrows the
  current 2-agent fan-out (e.g. 2×N agents across N repos).
- **Parallel sub-implementers**: only ever slice-level (never
  step-level), one worktree per slice, coordinator cherry-picks
  sequentially to preserve linear history. Requires measured wall-clock
  pain on large plans.

## See also

- **[Skills](skills.md)** — the full per-skill reference for all 31 skills.
- **[Testing](testing.md)** — the six-layer test harness and which layer each check belongs at.
- **[Vision](vision.md)** — the loop-driven end state this design builds toward.
- **[Ethos](ethos.md)** — the principles behind the pipeline.
- **[Overview](index.md)** — the landing page and pipeline overview.
