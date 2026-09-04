---
name: product-requirements-doc
description: 'Defines when and how to write `3-prd.md`. Load during Question for vague, multi-story, cross-cutting, or behavior-replacing work.'
user-invocable: false
---

# Product Requirements Document

A PRD complements `1-task.md` when a request needs explicit behavior, scope, acceptance criteria, and constraints. Prefer precision over exhaustive detail. Write at seventh-grade, STE-flavored level; call the Skill tool with `writing-prose` and apply `## Self-lint` before finalizing.

## When to Write a PRD

The questioner also writes a PRD when the request is:

- vague/underspecified, with no observable done state;
- multiple user stories, user types, workflows, or related capabilities;
- cross-cutting across interacting subsystems; or
- replacing or significantly changing existing behavior whose boundary must be defined.

For a simple request such as “add a `--verbose` flag to the CLI,” `1-task.md` is sufficient.

## PRD contract

Write `docs/plans/<id>/3-prd.md` and reference it from `1-task.md`. Read [references/prd-template.md](references/prd-template.md) before writing its required **Problem Statement**, **User Stories**, **Acceptance Criteria**, **Scope Boundaries**, and **Constraints**.

- Stories use `As a [user type], I want to [action], so that [outcome].` Describe what users need, never ASTs, methods, or other implementation.
- Criteria use `GIVEN`/`WHEN`/`THEN` or a checklist. Each is testable, unambiguous, and complete across happy, error, and edge cases.
- Scope lists In Scope commitments, Out of Scope exclusions, and Future Scope deferrals.
- Constraints state non-negotiable performance, compatibility, security, and operational requirements.

## Consuming a PRD downstream

1. The design-author reads it first; it resolves ambiguity in the original request.
2. Map every acceptance criterion to one or more design decisions.
3. Treat scope boundaries as the scope fence. Structure and plan add no out-of-scope slices.

The structure-planner derives vertical-slice acceptance tests from these criteria.

## Rules

- PRDs define behavior, not implementation. Design defines implementation.
- Every criterion must be testable; aspirations are not criteria.
- Scope boundaries are commitments even when excluded work appears easy.
- The questioner owns the PRD. The design-author may surface acceptance-criterion questions interactively but may not change criteria unilaterally.
