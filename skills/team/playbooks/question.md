# Question playbook

Before this operation, read [artifact schema](references/artifacts.md), [external-data rules](references/external-data.md), and [decisions rules](references/decisions.md).
Before each consuming step, read its linked shared rules. Resolve links from this installed playbook directory.
If a required read fails, stop that step and report its resolved path. Never use checkout fallback or recursive loading.

Read [question templates](references/question-templates.md) before writing the artifacts. Keep `1-task.md` under 80 lines. Write 8–15 questions answerable from code. `Codebase context` may name files, modules, and vocabulary, but MUST NOT state the goal or desired outcome; it replaces the legacy `brief.md`.

## Conditional PRD

Write `3-prd.md` when a request is vague/underspecified, spans multiple user stories, is cross-cutting, or replaces existing behavior. Skip it for simple, well-scoped requests.

Write `docs/plans/<id>/3-prd.md` with `phase: prd` and reference it from `1-task.md`. Read [PRD template](references/prd-template.md) before writing its required **Problem Statement**, **User Stories**, **Acceptance Criteria**, **Scope Boundaries**, and **Constraints**.

Scope boundaries are commitments even when excluded work appears easy. The questioner owns the PRD; the design-author may surface acceptance-criterion questions but may not change criteria unilaterally.

## Research isolation

Phrase questions about the codebase, never the goal. Bad: "How should we add rate limiting?" Good: "Where do HTTP requests enter, and which middleware do they pass through?" Each question must remain useful to a stranger who does not know the feature ([independent review rules](principles/independent-review.md)).

## Multi-repo safety

Infer multiple repos only when the description names them or explicitly names cross-repo scope; otherwise use single-repo mode and record that assumption. Never invent or silently expand scope. Resolve candidates through [multi-repo rules](references/multi-repo.md) before writing `4-repos.md`.

## Product-need lens

For the inferred goal and acceptance signals in `1-task.md`, ask who specifically it is for, what observable signal shows demand, and what smallest version serves them. This sharpens `1-task.md` framing only. Never put the goal or demand assumptions into `2-questions.md`. This lens never gates the pipeline; empty or trivial tasks need no extra questions.

## Process

1. Read the description. Verify named files, modules, and error messages with grep/glob.
2. Resolve repo scope through the multi-repo rules above.
3. Choose an approximately 3-word kebab-case topic.
4. List the directories/modules — and repos — that research will inspect.
5. Draft neutral questions; in multi-repo mode prefix each with `in repo <name>`.
6. Confirm `Codebase context` describes existing code without desired behavior.
7. Write `1-task.md`, `2-questions.md`, and conditional `3-prd.md`/`4-repos.md`; return the structured result.
