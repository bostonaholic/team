---
name: team
description: 'Use for the Team pipeline only on explicit request. Never infer from ordinary coding work. Runs QRSPI or a leading route.'
effort: high
argument-hint: "<ticket id, issue URL, feature description, or leading-argument route (investigate|plan|prototype|feature|fix|refactor)>"
---

# Team — Phase-Table Orchestrator

Before each consuming step, read its linked shared rules from this installed skill directory.
If a required read fails, stop that step with the exact path. Never use checkout fallback or recursive loading.

Before finalizing prose you author, read the [writing standards](references/writing.md). Relay completed agent and vendor returns unchanged.

You are the Team orchestrator. The orchestrator is the **main session itself** — not a sub-agent.
You hold no state of your own: the durable record is `docs/plans/<id>/*.md`, whose YAML frontmatter
carries phase and revision metadata. Live in-session coordination uses TodoWrite.

## Routes

First read [routing](references/routing.md) and select the route from the
**leading argument** of `/team` before any setup or worktree. A route with no task
requests the task before any mutation. Never scan issue bodies or quoted text for route words.

## Core contracts

- Walk this phase table in order: `Worktree → Question → Research → Design → Structure → Plan → Implement → PR`.
- There are **no mid-run human gates**. Continue until the draft PR exists.
- At PR creation, use [tracking rules](../team-pr/references/tracking.md) for the in-review transition and the multi-repo home-only closing rule.
- Before WORKTREE, run the non-blocking probes `ssh-add -l`, `gh auth status`, and `git config --global --get commit.gpgsign`; no result blocks the run.
- Read [design reviewer brief](../eng-design-doc-review/references/design-reviewer.md) and dispatch its review brief with the artifact directory substituted.
- Read `references/15-host-dispatch.md` before the first dispatch and resolve every agent through it.
- Read [finding format](../code-review/references/findings.md) before aggregating IMPLEMENT findings.
- In multi-repo mode, use `4-repos.md`; see **Multi-repo topics** in the Rules reference.
- PR changelog bullets accumulate under `## [Unreleased]` when the repo already
  has a root `CHANGELOG.md`; leave an absent file absent unless the user
  explicitly requested one.

## Where a phase agent's output lives

`questioner` writes its artifact. `researcher` and `file-finder` return text for the orchestrator to persist.

## Procedure references

Read each reference completely when reaching that stage. Follow them in order; later stages depend on state and gates established earlier.

0. [Routing](references/routing.md)
2. [Setup](references/02-setup.md)
3. [The Phase Loop](references/03-the-phase-loop.md)
5. [Where a phase agent's output lives](references/05-where-a-phase-agent-s-output-lives.md)
7. [Orchestrator-Emit Gate (leading worktree)](references/07-orchestrator-emit-gate-leading-worktree.md)
8. [Design Review Gate (design)](references/08-design-review-gate-design.md)
10. [Orchestrator-Emit Gate (post-design-review secondary worktrees)](references/10-orchestrator-emit-gate-post-design-review-secondary-worktrees.md)
11. [Mechanical Gate (test confirmation)](references/11-mechanical-gate-test-confirmation.md)
12. [Aggregate Gate (review collection)](references/12-aggregate-gate-review-collection.md)
13. [Orchestrator-Emit Gate (PR / ship)](references/13-orchestrator-emit-gate-pr-ship.md)
14. [Rules](references/14-rules.md)
15. [Host-neutral agent dispatch](references/15-host-dispatch.md)

## Applied principles

Read and apply: [focused work rules](principles/focused-work.md), [verified results rules](principles/verified-results.md),
[durable state rules](principles/durable-state.md), [boil the ocean rules](principles/boil-the-ocean.md), and
[execution rules](references/execution.md).
