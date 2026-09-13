# Question playbook

Before this operation, read [artifact schema](references/artifacts.md), [external-data rules](references/external-data.md), and [decisions rules](references/decisions.md).
Before each consuming step, read its linked shared rules. Resolve links from this installed playbook directory.
If a required read fails, stop that step and report its resolved path. Never use checkout fallback or recursive loading.

The questioner decomposes intent into `1-task.md`, neutral codebase questions in `2-questions.md`, a conditional `3-prd.md`, and a resolved `4-repos.md`.

## Artifact invariants

`topic` is identical across artifacts: the kebab portion of `<id>` after removing `<TICKET>-` or `<YYYY-MM-DD>-`. The questioner chooses it once; downstream phases copy it verbatim. Never use the ticket, date, or a rewording. `ticketId` appears only in `1-task.md`. Full schema: [artifact schema](references/artifacts.md).

Read [question templates](references/question-templates.md) before writing the artifacts. Keep `1-task.md` under 80 lines. Write 8–15 questions answerable from code. `Codebase context` may name files, modules, and vocabulary, but MUST NOT state the goal or desired outcome; it replaces the legacy `brief.md`.

## Conditional PRD

Write `3-prd.md` when a request is vague/underspecified, spans multiple user stories, is cross-cutting, or replaces existing behavior. Skip it for simple, well-scoped requests such as "add a `--verbose` flag to the CLI".

Write `docs/plans/<id>/3-prd.md` with `phase: prd` and reference it from `1-task.md`. Read [PRD template](references/prd-template.md) before writing its required **Problem Statement**, **User Stories**, **Acceptance Criteria**, **Scope Boundaries**, and **Constraints**.

- Stories use `As a [user type], I want to [action], so that [outcome].` They describe what users need, never ASTs, methods, or other implementation.
- Criteria use `GIVEN`/`WHEN`/`THEN` or a checklist. Each is testable, unambiguous, and complete across happy, error, and edge cases.
- Scope lists In Scope commitments, Out of Scope exclusions, and Future Scope deferrals.
- Constraints state non-negotiable performance, compatibility, security, and operational requirements.

PRDs define behavior, not implementation; design defines implementation. Scope boundaries are commitments even when excluded work appears easy. The questioner owns the PRD; the design-author may surface acceptance-criterion questions but may not change criteria unilaterally.

Downstream, the design-author reads `3-prd.md` first, maps every acceptance criterion to a design decision, and treats scope boundaries as the scope fence. The structure-planner derives vertical-slice acceptance tests from these criteria.

## Research isolation

Phrase questions about the codebase, never the goal. Bad: "How should we add rate limiting?" Good: "Where do incoming HTTP requests enter the application and what middleware chain do they pass through?" Each question must remain useful to a stranger who does not know the feature ([independent review rules](principles/independent-review.md)).

## Multi-repo safety

Infer multiple repos only when the description names them or explicitly names cross-repo scope; otherwise use single-repo mode and record that assumption. Never invent or silently expand scope. Resolve candidates through [multi-repo rules](references/multi-repo.md) before writing `4-repos.md`.

## Product-need lens

For the inferred goal and acceptance signals in `1-task.md`, ask: Who specifically is this for? What observable signal shows demand? What is the smallest version that serves them? These sharpen `1-task.md` framing only. Never put the goal or demand assumptions into `2-questions.md`. This lens never gates the pipeline; empty or trivial tasks need no extra questions.

## Process

1. Read the description. Verify named files, modules, and error messages with grep/glob.
2. Resolve repo scope through the multi-repo rules above.
3. Choose an approximately 3-word kebab-case topic.
4. List the directories/modules — and repos — that research will inspect.
5. Draft neutral questions; in multi-repo mode prefix each with `in repo <name>`.
6. Confirm `Codebase context` describes existing code without desired behavior.
7. Write `1-task.md`, `2-questions.md`, and conditional `3-prd.md`/`4-repos.md`; return the structured result.
