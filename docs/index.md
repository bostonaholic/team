---
title: Overview
description: "Team orchestrates specialized agents that implement features end-to-end through the QRSPI pipeline. The full pipeline runs on Claude Code; the standalone utilities also work on Codex CLI and Antigravity CLI."
permalink: /
audience: [user, developer]
nav_order: 1
nav_label: home
---

# Team

Autonomous feature delivery for Claude Code.

## What is Team?

Team orchestrates 13 specialized agents. They range from isolated researchers to adversarial
reviewers. Together they drive a feature through an 8-phase pipeline (QRSPI) and deliver a
verified pull request.

Agents are decoupled microservices. Each one consumes a predecessor artifact on disk, does its
work, and writes its own artifact. The orchestrator is the main Claude Code session. It walks a
linear phase table with no mid-run human gates. An adversarial design review gates the design,
and the human reviews the finished PR.

## The pipeline

```
WORKTREE → QUESTION → RESEARCH → DESIGN → STRUCTURE → PLAN → IMPLEMENT → PR
```

| Phase | What happens |
|-------|-------------|
| **Worktree** | The orchestrator prepares an isolated git worktree first. It authors `docs/plans/<id>/` inside that worktree. Your home checkout stays clean for the whole run. |
| **Question** | Decompose intent into `task.md` + neutral `questions.md`. The questioner is the only agent that ever sees your original description. |
| **Research** *(isolated)* | Parallel agents (file-finder + researcher) consume only `questions.md`. They never see the task. This isolation prevents opinion bias. |
| **Design** *(design review)* | The design author drafts a ~200-line alignment doc. It resolves its own open questions as recorded assumptions. An adversarial design review gates advancement. |
| **Structure** | Break the design into vertical slices with verification checkpoints. The document is about two pages. It advances to Plan with no gate. |
| **Plan** | The planner derives a tactical implementation plan from the structure. The implementer reads it. No gate applies. |
| **Implement** | Test-first → slice execution → 5 parallel reviewers + typed retry loop. |
| **PR** | Update changelog, commit, open pull request. |

## Install

Team ships a native manifest for each host, so one repo installs on all three
from a local checkout. The full pipeline needs Claude Code, because that is the
host that dispatches the agents. The standalone utilities work on all three.
Pick yours.

### Claude Code

```bash
claude plugin add /path/to/team
```

That is the whole install. Skills register as slash commands (`/team`,
`/shipit`), and agents and hooks load with them.

Then run a phase end-to-end:

```bash
/team Add rate limiting middleware to all API endpoints
```

For a focused bug fix that skips the QRSPI ceremony:

```bash
/team-fix Users see stale cache after profile update
```

### Codex CLI

```bash
codex plugin marketplace add /path/to/team
codex plugin add team@team-dev
```

Skills arrive **namespaced** — ask for `team:shipit`, not `shipit`. Codex
budgets its skill catalog, so it shortens the longest descriptions; the skills
still work. The `/team-*` pipeline commands load but cannot dispatch Claude
Code agents, so they will not run the pipeline. The standalone utilities do.

> **Two skills lose a safety guard here.** `team:pr-watch-as-reviewer` casts an
> approval that can transitively merge a PR, and `team:pr-rebase` force-pushes
> a rewritten branch over published history. Both set
> `disable-model-invocation` so only a person can start them, and **Codex
> ignores that key**. To keep the guards:

```bash
rm -rf "$CODEX_HOME/plugins/cache"/*/team/*/skills/pr-watch-as-reviewer
rm -rf "$CODEX_HOME/plugins/cache"/*/team/*/skills/pr-rebase
```

Re-running `codex plugin add` restores them.

### Antigravity CLI

```bash
agy plugin install /path/to/team
```

Team ships `plugin.json` at the repo root, which is this host's plugin marker,
so it installs as a native Antigravity plugin — every skill and every agent
installs with it. `agy plugin uninstall team` removes it.

Skills arrive under **bare names** — ask for `shipit`, not `team:shipit`. The
install copies the checkout, so upgrading means installing again. Unlike
Codex, this host honors `disable-model-invocation`, so nothing needs removing
afterward. The `/team-*` pipeline commands install but are not claimed to run
here yet, because agent dispatch on this host is untested
([#56](https://github.com/bostonaholic/team/issues/56)).

Developing Team itself? The install copies, so link your checkout instead:

```bash
script/dev-install antigravity
script/dev-uninstall antigravity
```

## Read next

- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles that make the autonomous middle trustworthy.
- **[Architecture](architecture.md)**: full design, artifact frontmatter, phase-inference rules.
- **[Skills](skills.md)**: all 55 skills, their arguments, consumers, and behaviors.
- **[Cross-host portability](cross-host-portability.md)**: the capability matrix for Codex CLI, the Antigravity CLI host facts, and the chosen portability strategy.
- **[GitHub repository](https://github.com/bostonaholic/team)**: source, agents, skills.
