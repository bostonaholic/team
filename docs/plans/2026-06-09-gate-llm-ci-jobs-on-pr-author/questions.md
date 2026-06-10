---
topic: gate-llm-ci-jobs-on-pr-author
date: 2026-06-09
phase: questions
---

# Research Questions: gate-llm-ci-jobs-on-pr-author

## Codebase context

- Scope: `.github/workflows/` — specifically `behavioral-evals.yml` and
  `harness-checks.yml`; `tests/*.evals.ts`; `scripts/`; `tests/helpers/`
- Vocabulary:
  - *paid job*: a GitHub Actions job that sets `EVALS_ANTHROPIC_API_KEY` or
    `ANTHROPIC_API_KEY`, or executes `bun test ./tests/*.evals.ts` with a
    live model path (not the `EVALS_MOCK_AGENT` mock path)
  - *gate-tier eval*: a test in `tests/*.evals.ts` that carries
    `tier: gate` in its fixture frontmatter and is expected to run on PRs
  - *periodic-tier eval*: a test that carries `tier: periodic` and runs on
    `schedule` / `workflow_dispatch`
  - *trusted author*: a GitHub actor whose identity is used to decide whether
    a workflow run may consume secrets

## Topology

1. What triggers does each existing workflow in `.github/workflows/` respond
   to, and which jobs within those workflows set or consume
   `EVALS_ANTHROPIC_API_KEY` or `ANTHROPIC_API_KEY`?

2. In `harness-checks.yml`, which job steps run `bun test` and with what
   arguments? Does any step currently pass an explicit `*.evals.ts` path or
   set `EVALS_ANTHROPIC_API_KEY`?

3. In `behavioral-evals.yml`, what is the full job dependency graph? Are there
   any jobs whose execution depends on the output of a prior job (e.g., a
   `discover` or `matrix` job)?

4. Does the repository have any existing workflow-level or job-level `if:`
   conditions that check `github.actor`, `github.event.pull_request.author_association`,
   `github.repository_owner`, or similar author/association context fields?

## Conventions

5. What concurrency group naming pattern do the existing workflows use, and
   does either workflow use `cancel-in-progress`?

6. What permissions block (if any) do existing workflow jobs declare, and what
   is the minimum permission set each job actually needs?

7. Are there any existing reusable workflows (`.github/workflows/*.yml` with
   `on: workflow_call:`) or composite actions (`.github/actions/`) in this
   repository?

## Constraints

8. What GitHub Actions context fields and functions are available at the
   workflow `on:` level versus the job `if:` level for checking the identity
   of the actor who triggered a `pull_request` event? (e.g.,
   `github.actor`, `github.event.pull_request.user.login`,
   `github.event.pull_request.author_association`)

9. What is the behavior of GitHub Actions when a secret (e.g.,
   `EVALS_ANTHROPIC_API_KEY`) is referenced in a fork PR — is it empty, absent,
   or does the job fail? Does this differ between `pull_request` and
   `pull_request_target` triggers?

10. In `tests/helpers/session-runner.ts`, what environment variable does the
    code check before deciding whether to spawn `claude -p` vs. replay a mock?
    What other env variables gate the paid execution path?

## Reference points

11. What is the most concise existing example in open-source GitHub Actions
    workflows of a job-level `if:` condition that gates on
    `github.event.pull_request.author_association` being `OWNER` or
    `COLLABORATOR`? (Answer from code knowledge, not web search.)

12. In the current `behavioral-evals.yml`, how is the matrix of eval suites
    defined — is it a static list, or is there a `discover` job that
    dynamically generates it? What would change about the matrix definition
    if a `discover` job were introduced by an in-flight branch?
