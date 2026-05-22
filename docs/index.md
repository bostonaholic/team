---
title: Overview
description: "Team — a Claude Code plugin that orchestrates specialized agents to autonomously implement features end-to-end via the QRSPI pipeline."
permalink: /
---

# Team

The autonomous engineering mesh for Claude Code.

## What is Team?

Team orchestrates **13 specialized agents** — from blind researchers to adversarial reviewers — that drive a feature through an 8-phase pipeline (QRSPI) and deliver a verified pull request. Agents are decoupled microservices: each consumes a predecessor artifact on disk, does its work, and writes its own artifact. The orchestrator (the main Claude Code session) walks a linear phase table and runs two human approval gates.

## The Pipeline

```
QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → WORKTREE → IMPLEMENT → PR
```

| Phase | What happens |
|-------|-------------|
| **Question** | Decompose intent into `task.md` + neutral `questions.md`. The questioner is the only agent that ever sees your original description. |
| **Research** *(blind)* | Parallel agents (file-finder + researcher) consume only `questions.md`. They never see the task — structurally preventing opinion-bias. |
| **Design** *(human gate)* | The design author runs an interactive interview, then drafts a ~200-line alignment doc. You review here. |
| **Structure** *(human gate)* | Break the design into vertical slices with verification checkpoints. ~2-page doc. You review here. |
| **Plan** | Tactical implementation plan derived from the approved structure. Read by the per-slice trio (`test-architect`, `greener`, `refactorer`); the implementer reads it only for review-fix context. Not human-gated. |
| **Worktree** | Orchestrator prepares an isolated git worktree. |
| **Implement** | Per-slice R-G-R trio (`test-architect` → red gate → `greener` → green gate → `refactorer` with optional commit) for every slice → 5 parallel reviewers + typed retry loop. |
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

- **[Architecture](architecture.md)** — full design, artifact frontmatter, phase-inference rules.
- **[GitHub repository](https://github.com/bostonaholic/team)** — source, agents, skills.
