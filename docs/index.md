---
title: Overview
description: "Team orchestrates specialized agents that implement features end-to-end through the QRSPI pipeline."
permalink: /
audience: [user, developer]
nav_order: 1
nav_label: home
---

# Team

**You have been made tech lead. Your team never sleeps.**

## Install

Copy/paste into your CLI prompt:

```text
Install the Team plugin from https://github.com/bostonaholic/team, refer to the repo's AGENTS.md for instructions.
```

Or 🔗 [check the installation instructions](https://github.com/bostonaholic/team/blob/main/INSTALL.md).

## What is Team?

Team orchestrates 13 specialized agents. They range from isolated researchers to adversarial
reviewers. Together they drive a feature through an 8-phase pipeline (QRSPI) and deliver a
verified pull request.

Agents are decoupled microservices. Each one consumes a predecessor artifact on disk, does its
work, and writes its own artifact. The orchestrator is the main session. It walks a
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
| **Design** *(design review)* | The design author drafts a ~300-line alignment doc. It resolves its own open questions as recorded assumptions. An adversarial design review gates advancement. |
| **Structure** | Break the design into vertical slices with verification checkpoints. The document is about two pages. It advances to Plan with no gate. |
| **Plan** | The planner derives a tactical implementation plan from the structure. The implementer reads it. No gate applies. |
| **Implement** | Test-first → slice execution → 5 parallel reviewers + typed retry loop. |
| **PR** | Update an existing changelog, commit, open pull request. A missing root changelog stays absent unless explicitly requested. |

## The governance stack

Every team you have worked on had rules that made its output trustworthy: an
author does not approve their own pull request, a design gets challenged before
it is built, security reads the change before it ships. Team ships those rules
as machinery rather than as manners.

| The rule | How Team enforces it |
|----------|----------------------|
| An author never approves their own work | Reviewers hold no `Write` or `Edit` tool and run in `plan` mode. Enforced by frontmatter, not requested in a prompt. |
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

## Skills that moved

Team now ships only its pipeline. Its other 18 skills moved to the `bostonaholic/skills` collection, which installs without Team, and took gerund names there:

| Team command | Now in bostonaholic/skills |
| --- | --- |
| `/agent-prompt` | `/composing-agent-prompts` |
| `/audit-complexity` | `/auditing-complexity` |
| `/audit-tests` | `/auditing-tests` |
| `/code-review` | `/reviewing-code` |
| `/eng-design-doc-review` | `/reviewing-design-docs` |
| `/groom-backlog` | `/grooming-backlogs` |
| `/how` | `/explaining-architecture` |
| `/no-comments` | `/removing-comments` |
| `/paparazzi` | `/capturing-screenshots` |
| `/pr-open-comments` | `/addressing-pr-comments` |
| `/pr-rebase` | `/rebasing-branches` |
| `/pr-screenshots` | `/attaching-pr-screenshots` |
| `/pr-watch-as-author` | `/watching-authored-prs` |
| `/pr-watch-as-reviewer` | `/watching-reviewed-prs` |
| `/prove` | `/proving-claims` |
| `/retro` | `/running-retros` |
| `/shipit` | `/landing-prs` |
| `/why` | `/investigating-design-rationale` |

The standalone `pr-cleanup` command is retired. Team retains its internal pipeline cleanup.

Install the collection as a plugin on Claude Code:

```bash
claude plugin marketplace add bostonaholic/skills
claude plugin install bostonaholic@skills
```

On Codex:

```bash
codex plugin marketplace add bostonaholic/skills
codex plugin add bostonaholic@skills
```

On other agents, such as Antigravity or OpenCode, pick skills with the command below. To install one skill, add `--skill <name>`.

```bash
npx skills@latest add bostonaholic/skills
```

As plugins, the skills carry the `bostonaholic:` prefix instead of `team:`. Update Team first, then install the skills. Docs: https://skills.bostonaholic.dev

**Set up before v0.147.0?** Update Team, then run `/team-migrate` (`team:team-migrate` on Codex). It finds every harness on the machine, shows one plan, and after you confirm it installs Team and the collection natively everywhere, removes local-checkout installs and their pull hooks, and moves old-name skill copies to a `-retired` folder. It deletes no skill copy, and a second run changes nothing.

The pipeline does not need these skills. It keeps its own copies of the reviewer briefs, the screenshot upload, and the worktree teardown.

## Read next

- **[Vision](vision.md)**: the loop-driven end state Team builds toward.
- **[Ethos](ethos.md)**: the principles that make the autonomous middle trustworthy.
- **[Architecture](architecture.md)**: full design, artifact frontmatter, phase-inference rules.
- **[Skills](skills.md)**: all skills, each with the skills it mentions.
- **[Configuration](configuration.md)**: the optional `.team/config.json` model overrides.
- **[Cross-host portability](cross-host-portability.md)**: the capability matrix for Codex CLI, the Antigravity CLI host facts, and the chosen portability strategy.
- **[GitHub repository](https://github.com/bostonaholic/team)**: source, agents, skills.
