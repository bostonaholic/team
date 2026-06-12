---
topic: gate-llm-ci-jobs-on-pr-author
date: 2026-06-09
phase: task
ticketId: bostonaholic/team#51
---

# Task: gate-llm-ci-jobs-on-pr-author

## Description

Any GitHub Actions job that consumes LLM tokens (e.g., `claude -p` invocations
in evals, LLM judge passes that call the Anthropic API) must NOT run when a PR
is opened by someone other than the repo owner or trusted collaborators.
External PRs — including forks and unknown contributors — should skip those
jobs to prevent token-cost griefing and accidental API key burn.

The current state:
- `.github/workflows/behavioral-evals.yml` is the paid LLM tier. It uses
  `EVALS_ANTHROPIC_API_KEY`, spawns `claude -p`, and runs LLM judge passes.
  Its triggers are `schedule` + `workflow_dispatch` only, so it is safe today.
- `.github/workflows/harness-checks.yml` is the free static tier. It runs on
  `pull_request` against main with no token consumption.

The risk addressed here is forward-looking: two in-flight PRs (#32 and #47)
expand the eval surface. PR #32 adds `scripts/run-gate-evals.ts` wired into
`harness-checks.yml` — a seam where paid jobs could later attach to
`pull_request` triggers. PR #47 adds more `tests/*.evals.ts` suites to the
periodic tier. The gate must exist before either of those PRs introduces a
`pull_request`-triggered job that calls the Anthropic API.

The deliverable must coexist with both in-flight PRs: minimize merge-conflict
surface in the workflow files, and ensure the author gate covers jobs those
PRs introduce or enable.

## Stated goal

Prevent LLM-token-consuming CI jobs from running on PRs opened by untrusted
authors (external contributors, forks, Dependabot, or unknown accounts).

## Inferred goal

Establish a durable, low-maintenance author-trust check that any future
workflow job can reference with a single condition expression, so the gate
remains effective as new paid jobs are added without requiring per-job policy
decisions each time.

## Acceptance signals

- A PR opened by an external / untrusted author skips all LLM-token jobs
  (no `EVALS_ANTHROPIC_API_KEY` consumption, no `claude -p` spawns).
- A PR opened by the repo owner or a trusted collaborator runs those jobs
  as normal.
- The gate mechanism is defined in one place; individual jobs reference it
  rather than duplicating author-check logic.
- PR #32 and PR #47 can merge without conflicting with this change (or the
  conflict surface is explicitly identified and documented).
- Dependabot PRs are correctly classified (skip LLM jobs).

## Open assumptions

- The trusted-author set is: repo owner (`bostonaholic`) plus explicitly
  designated collaborators. No org-team lookup is required.
- A job-level `if:` condition or a reusable workflow is the preferred
  mechanism (not a separate "gate" job that other jobs depend on, unless
  that proves cleaner).
- Secrets being unavailable to fork PRs by default is not sufficient on its
  own — the gate should be an explicit author-trust check so it is visible
  and auditable.
- `workflow_dispatch` and `schedule` triggers are always trusted and should
  never be gated.
