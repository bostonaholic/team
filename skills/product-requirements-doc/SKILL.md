---
name: product-requirements-doc
description: Write 3-prd.md for vague, multi-story, cross-cutting, or behavior-replacing requests.
user-invocable: false
---

# Product Requirements Document

## Input

Write a PRD for a vague, multi-story, cross-cutting, or behavior-replacing
request. A simple scoped request needs only `1-task.md`.

Call the Skill tool with `writing-prose` and apply its `## Self-lint` in
STE-flavored mode.

## Required output

Write `docs/plans/<id>/3-prd.md` beside `1-task.md`. Never modify a supplied
`1-task.md`; artifact presence is the reference consumed by later phases.

### Problem Statement

State the user's problem, cause, and reason to solve it.

### User Stories

List every in-scope workflow as:

```
As a [user type], I want to [action], so that [outcome].
```

Keep stories behavioral. Put excluded stories in Non-Goals and deferred ones
in Future Scope.

### Acceptance Criteria

Map each story to testable, unambiguous happy-path, error, and edge outcomes.
Use GIVEN/WHEN/THEN or checkboxes. Aspirations are not criteria.

### Scope Boundaries

List **In Scope**, **Out of Scope**, and **Future Scope** explicitly.

### Constraints

Record non-negotiable performance, compatibility, security, and operational
requirements.

## Consuming a PRD downstream

The design-author reads it first, maps every acceptance criterion to design
decisions, and treats scope boundaries as the scope fence. The
structure-planner derives vertical-slice acceptance tests from those criteria.
The design-author may flag ambiguity but may not change criteria unilaterally.

## Done

The PRD states behavior, not implementation. Every story maps to testable
criteria, and later artifacts add nothing outside its scope.
