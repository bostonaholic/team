# Question playbook

Before this operation, read [artifact schema](references/artifacts.md), [external-data rules](references/external-data.md), and [decisions rules](references/decisions.md).
Resolve links from the installed `skills/team/` directory and read each step's linked rules before it. If a read fails, stop that step and report the resolved path; never use checkout fallback or recursive loading.

The questioner decomposes intent into `1-task.md`, neutral codebase questions in `2-questions.md`, a conditional `3-prd.md`, and a resolved `4-repos.md`.

## Artifact invariants

`topic` is identical across artifacts: the `topic=` line `scripts/plan-id.sh --parse <id>` prints. The questioner chooses it once; downstream phases copy it verbatim. `ticketId` appears only in `1-task.md`.

Read [question templates](references/question-templates.md) before writing the artifacts. Write 8–15 questions answerable from code. `Codebase context` may name files, modules, and vocabulary but MUST NOT state the goal or desired outcome.

## Conditional PRD

Write `3-prd.md` when a request is vague/underspecified, spans multiple user stories, is cross-cutting, or replaces existing behavior. Skip it for simple, well-scoped requests such as "add a `--verbose` flag to the CLI".

Write `docs/plans/<id>/3-prd.md` with `phase: prd` and reference it from `1-task.md`. Read [PRD template](references/prd-template.md) before writing its required **Problem Statement**, **User Stories**, **Acceptance Criteria**, **Scope Boundaries**, and **Constraints**.

PRDs define behavior; design defines implementation. Scope boundaries are commitments even when excluded work looks easy. The questioner owns the PRD; the design-author may question acceptance criteria but never change them.

## Research isolation

Phrase questions about the codebase, never the goal. Bad: "How should we add rate limiting?" Good: "Where do incoming HTTP requests enter the application and what middleware do they pass through?" Each question must stay useful to a stranger who does not know the feature ([independent review rules](principles/independent-review.md)).

## Multi-repo safety

Infer multiple repos only when the description names them or explicitly names cross-repo scope; otherwise use single-repo mode and record that assumption. Never invent or silently expand scope. Resolve candidates through [multi-repo rules](references/multi-repo.md) before writing `4-repos.md`.

## Product-need lens

For `1-task.md`'s inferred goal and acceptance signals, ask who it is for, what observable signal shows demand, and what smallest version serves them. This sharpens `1-task.md` only, never `2-questions.md`, and never gates.

## Process

1. Read the description. Verify named files, modules, and error messages with grep/glob.
2. Resolve repo scope per Multi-repo safety.
3. Choose a 2–4 word kebab-case topic.
4. List the directories, modules, and repos research will inspect.
5. Draft neutral questions; in multi-repo mode prefix each with `in repo <name>`.
6. Write `1-task.md`, `2-questions.md`, and conditional `3-prd.md`/`4-repos.md`; return the structured result.
