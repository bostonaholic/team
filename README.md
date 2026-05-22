# Team

A Claude Code plugin that orchestrates specialized agents to autonomously implement entire features end-to-end, driven by the **QRSPI** workflow. The orchestrator is the main Claude Code session; it persists pipeline state as artifacts in `docs/plans/` and tracks live progress with TodoWrite.

📖 **Documentation:** [team.bostonaholic.dev](https://team.bostonaholic.dev)

## Design Philosophy

Each agent does work and returns an artifact. The orchestrator dispatches the next agent based on a phase table. Agents remain decoupled — they know nothing about each other.

## Pipeline (QRSPI)

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR
```

- **Question** — Decompose intent into a full task record (`task.md`) and neutral research questions (`questions.md`). The questioner is the only agent that ever sees the user's original description.
- **Research** *(blind)* — Parallel agents (file-finder + researcher) consume only `questions.md`. They never see the task. This structurally prevents opinion-bias in research findings.
- **Design** *(human gate)* — Design author asks open questions interactively, then drafts a ~200-line alignment doc. Humans review here.
- **Structure** *(human gate)* — Break the design into vertical slices with verification checkpoints. Humans review the ~2-page structure here.
- **Plan** — Tactical implementation plan derived from the approved structure. Read by the per-slice trio (`test-architect`, `greener`, `refactorer`); the `implementer` reads it only for review-fix context. Not human-gated.
- **Worktree** — Orchestrator prepares an isolated git worktree.
- **Implement** — Per-slice R-G-R trio: `test-architect` (per slice) writes failing tests → mechanical red gate → `greener` (per slice) writes the minimum code that turns the slice green → mechanical green gate (3-attempt cap; prior slices' tests must still pass) → `refactorer` (per slice; commit optional, no-op produces no commit). After every slice completes, 5 parallel reviewers (`code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`) run an aggregate hard gate with a typed failure-class retry loop (max 5 rounds). `implementer` is reserved for the review-fix loop on aggregate-gate failure.
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
/team-research docs/plans/<id>/
/team-design docs/plans/<id>/
/team-structure docs/plans/<id>/
/team-plan docs/plans/<id>/
/team-worktree docs/plans/<id>/
/team-implement docs/plans/<id>/
/team-pr docs/plans/<id>/
```

Each command after `/team-question` takes the artifact directory printed by
the previous step (`docs/plans/<id>/`) as its single argument.

## Install

```
claude plugin add /path/to/team
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for the full architecture, the artifact frontmatter schema, and the phase-inference rules.

## Components

- **15 agents** in `agents/` — decoupled workers that read predecessor artifacts from `docs/plans/` and write their outputs there
- **15 entry-point + methodology skills** in `skills/` — slash commands and shared methodologies
- **4 hooks** in `hooks/` — safety guards and `docs/plans/`-aware compaction resilience
- **1 registry** at `skills/team/registry.json` — phase-tagged inventory of the 15 agents
- **State** lives in `docs/plans/<id>/*.md` — `<id>` is `<TICKET>-<topic>` or `<YYYY-MM-DD>-<topic>`. Each artifact carries YAML frontmatter (`topic`, `date`, `phase`; gated artifacts also carry `approved`, `approved_at`, `revision`). Live in-session coordination uses TodoWrite.
