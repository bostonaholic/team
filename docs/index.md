---
title: Overview
description: "Team orchestrates specialized agents that implement features end-to-end through the QRSPI pipeline. The full pipeline runs on Claude Code; the standalone utilities also work on Codex CLI and Antigravity CLI."
permalink: /
audience: [user, developer]
nav_order: 1
nav_label: home
---

# Team

**You have been made tech lead. Your team never sleeps.**

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
| **Question** | Decompose intent into `1-task.md` + neutral `2-questions.md`. The questioner is the only agent that ever sees your original description. |
| **Research** *(isolated)* | Parallel agents (file-finder + researcher) consume only `2-questions.md`. They never see the task. This isolation prevents opinion bias. |
| **Design** *(design review)* | The design author drafts a ~200-line alignment doc. It resolves its own open questions as recorded assumptions. An adversarial design review gates advancement. |
| **Structure** | Break the design into vertical slices with verification checkpoints. The document is about two pages. It advances to Plan with no gate. |
| **Plan** | The planner derives a tactical implementation plan from the structure. The implementer reads it. No gate applies. |
| **Implement** | Test-first → slice execution → 5 parallel reviewers + typed retry loop. |
| **PR** | Update changelog, commit, open pull request. |

## The governance stack

Every team you have worked on had rules that made its output trustworthy: an
author does not approve their own pull request, a design gets challenged before
it is built, security reads the change before it ships. Team ships those rules
as machinery rather than as manners.

| The rule | How Team enforces it |
|----------|----------------------|
| An author never approves their own work | Reviewers hold no `Write` or `Edit` tool and run in `plan` mode. Pinned by `tests/protocol.test.ts`, not requested in a prompt. |
| Review is not a rubber stamp | The implement loop re-runs until no Blocking or Major finding is left. There is no fixed number of rounds to outwait. |
| A reviewer cannot be lobbied | Reviewers read the diff and a spec written before the code existed, never the implementer's account of its own work. |
| The design is challenged before it is built | A fresh-context adversarial design review hard-gates the pipeline. |
| Nobody escalates to dodge a check | The orchestrator is forbidden from handing a blocking finding to the human mid-run. |
| Every decision is on the record | `docs/plans/<id>/` holds the task, the questions, the research, the design, every review verdict, and the plan. Files in the repo, not chat history. |

You cannot overrule the security reviewer by asking nicely. [Ethos](ethos.md)
explains why each rule exists.

## How far the delegation goes

Team's scope today is contained: a groomed ticket, one repository, a context
that already exists. Each rung above that hands Team a less framed problem — a
problem statement, then an outcome to move — until one person carries
company-significant work from problem definition through measured outcomes.
[Vision](vision.md) has the ladder.

## Install

Team ships a native manifest for each host, so one repo installs on all three
from a local checkout. The full pipeline needs Claude Code, because that is the
host that dispatches the agents. The standalone utilities work on all three.
Pick yours.

### Claude Code

```bash
claude plugin marketplace add /path/to/team
claude plugin install team@team-dev
```

The first command registers the checkout as a marketplace; the second installs
from it. Skills register as slash commands (`/team`, `/shipit`), and agents and
hooks load with them.

For a clone-backed install that updates when `git pull` changes the checkout:

```bash
script/dev-install claude
```

This adds clone-local hooks for merge and rebase pulls. Existing non-Team hooks
and a `core.hooksPath` outside the clone are never overwritten: the install
still completes, and reports that it skipped the hooks and how to wire them up
yourself. Remove the install and Team-owned hooks with:

```bash
script/dev-uninstall claude
```

**Turn on auto-update, or you stay on the version you installed.** Claude Code
enables auto-update for official Anthropic marketplaces by default and
**disables it for local development marketplaces** — which is what a local
checkout is. Without it, `git pull`ing this repo moves the source while your
installed copy stays pinned, silently, with nothing to tell you a release
happened. Toggle it in `/plugin` → **Marketplaces** → `team-dev` → **Enable
auto-update**, or declare it in `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "team-dev": {
      "source": { "source": "directory", "path": "/path/to/team" },
      "autoUpdate": true
    }
  }
}
```

Claude Code then checks after a session starts, on a random delay of up to ten
minutes, so the running session keeps what it launched with. When a plugin
updates you are prompted to run `/reload-plugins` — a full restart is not
needed. To update on demand instead, refresh the marketplace before the plugin:

```bash
claude plugin marketplace update team-dev
claude plugin update team@team-dev
```

The order matters. `plugin update` reads the cached catalog, so on its own it
reports nothing to do.

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

### Antigravity CLI

```bash
agy plugin install /path/to/team
```

Team ships `plugin.json` at the repo root, which is this host's plugin marker,
so it installs as a native Antigravity plugin — every skill and every agent
installs with it. `agy plugin uninstall team` removes it.

Skills arrive under **bare names** — ask for `shipit`, not `team:shipit`. The
install copies the checkout, so upgrading means installing again.

Developing Team itself? The install copies, so link your checkout instead:

```bash
script/dev-install antigravity
script/dev-uninstall antigravity
```

## Read next

- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles that make the autonomous middle trustworthy.
- **[Architecture](architecture.md)**: full design, artifact frontmatter, phase-inference rules.
- **[Skills](skills.md)**: all skills, each with the skills it mentions.
- **[Cross-host portability](cross-host-portability.md)**: the capability matrix for Codex CLI, the Antigravity CLI host facts, and the chosen portability strategy.
- **[GitHub repository](https://github.com/bostonaholic/team)**: source, agents, skills.
