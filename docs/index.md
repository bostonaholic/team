---
title: Overview
description: "Team — a Claude Code plugin that orchestrates specialized agents to autonomously implement features end-to-end via the QRSPI pipeline."
permalink: /
audience: [user, developer]
nav_order: 1
nav_label: home
---

# Team

The autonomous engineering mesh for Claude Code.

## What is Team?

Team orchestrates **13 specialized agents** — from isolated researchers to adversarial reviewers — that drive a feature through an 8-phase pipeline (QRSPI) and deliver a verified pull request. Agents are decoupled microservices: each consumes a predecessor artifact on disk, does its work, and writes its own artifact. The orchestrator (the main Claude Code session) walks a linear phase table and runs a single human approval gate (design).

## The Pipeline

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR
```

| Phase | What happens |
|-------|-------------|
| **Worktree** | Orchestrator prepares an isolated git worktree first and authors `docs/plans/<id>/` inside it, so your home checkout stays clean for the whole run. |
| **Question** | Decompose intent into `task.md` + neutral `questions.md`. The questioner is the only agent that ever sees your original description. |
| **Research** *(isolated)* | Parallel agents (file-finder + researcher) consume only `questions.md`. They never see the task — structurally preventing opinion-bias. |
| **Design** *(human gate)* | The design author runs an interactive interview, then drafts a ~200-line alignment doc. You review here. |
| **Structure** | Break the design into vertical slices with verification checkpoints. ~2-page doc. Produced autonomously — advances to Plan with no human gate. |
| **Plan** | Tactical implementation plan derived from the structure. Read by the implementer; not human-gated. |
| **Implement** | Test-first → slice execution → 5 parallel reviewers + typed retry loop. |
| **PR** | Update changelog, commit, open pull request. |

## Install

Team is a Claude Code plugin. Add it to your Claude Code installation:

```bash
claude plugin add /path/to/team
```

Then run a phase end-to-end:

```bash
/team Add rate limiting middleware to all API endpoints
```

For a focused bug fix that skips the QRSPI ceremony:

```bash
/team-fix Users see stale cache after profile update
```

## Read next

- **[Vision](vision.md)** — the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)** — the principles that make the autonomous middle trustworthy.
- **[Architecture](architecture.md)** — full design, artifact frontmatter, phase-inference rules.
- **[Skills](skills.md)** — all 46 skills, their arguments, consumers, and behaviors.
- **[GitHub repository](https://github.com/bostonaholic/team)** — source, agents, skills.
