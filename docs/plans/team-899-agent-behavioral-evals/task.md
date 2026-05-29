---
topic: agent-behavioral-evals
date: 2026-05-28
phase: task
ticketId: team-899
---

# Task: agent-behavioral-evals

## Description

Design and implement evals that test TEAM pipeline agents for behavioral
correctness — not static linting, but actual agent execution against
synthetic inputs with scored outputs. The goal is to detect regression
when underlying LLM models change (e.g., new Sonnet/Opus releases).

Architecture direction from the ticket notes: a custom subprocess harness
built on the repo's existing test runner (bash), not a third-party framework
(agentevals/braintrust). Three tiers:

1. Static validation — free, <5s, runs every PR as the gate tier.
2. E2E — invoke agents/pipeline via a `claude -p` subprocess runner and
   assert on real output.
3. LLM-as-judge — a Sonnet judge scores E2E output against rubrics
   (clarity, completeness).

Non-determinism handled by splitting: deterministic gate tier (blocks PRs)
vs. periodic tier (non-deterministic + expensive model runs, weekly cron).

Cost control via diff-based test selection: each test declares its file
deps; only evals touching changed files run locally; `ALL=1` forces the
full suite. Plus partial-result persistence (incremental JSON survives a
killed run) and timestamped result files with compare/summary tooling.

Priority agents to eval first: planner, implementer, reviewers
(judgment-heavy agents where regression is most consequential).

## Stated goal

Give maintainers a regression signal before shipping model updates, by
running agents against synthetic inputs and scoring their outputs.

## Inferred goal

The actual need is a reliable, low-friction signal that a new model version
hasn't degraded the pipeline's judgment — maintainers need confidence to
ship model bumps quickly rather than discovering regressions in production.

## Acceptance signals

- At least one agent (planner, implementer, or a reviewer) can be invoked
  end-to-end via a subprocess harness and its output scored by a rubric.
- A deterministic gate tier runs cleanly on every PR with no model calls.
- A periodic tier covers non-deterministic E2E scenarios and can be
  triggered manually or on a cron.
- Diff-based selection skips irrelevant evals on unchanged files.
- A failed eval names the specific rubric criterion that degraded, not just
  "output changed."

## Open assumptions

- The repo's test runner remains bash (consistent with `tests/*.sh`); Bun
  native test runner is available but not yet used for this repo's test suite.
- `claude -p` (headless Claude Code invocation) is the subprocess runner for
  agent execution, matching the gstack pattern referenced in the ticket.
- The judge model is Sonnet (same tier as reviewer agents) rather than Opus,
  to keep periodic-tier cost manageable.
- Synthetic inputs will be hand-authored (not generated) for the first slice
  to keep scope minimal.
- CI integration means GitHub Actions, consistent with the project's apparent
  delivery target.
