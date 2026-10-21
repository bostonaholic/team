# PRD template

Use this body for `3-prd.md` when the PRD criteria apply ([question playbook](playbooks/question.md)).

## Problem Statement

In 1–3 sentences: the user's problem, its cause, and why it matters now.

## User Stories

Every in-scope workflow:

```text
As a [user type], I want to [action], so that [outcome].
```

Excluded stories go in Non-Goals; possible later stories in Future Scope. State behavior ("what"), never implementation ("how").

## Acceptance Criteria

For each story:

```text
GIVEN [initial context]
WHEN [user action]
THEN [expected outcome]
```

Simple cases may use a checklist. Every criterion is testable and unambiguous; cover happy paths, errors, and edge cases.

## Scope Boundaries

**In Scope:** every required feature, behavior, and capability.

**Out of Scope:** every exclusion readers might otherwise assume.

**Future Scope:** desirable deferred features, recorded without entering current scope.

## Constraints

Non-negotiable performance, compatibility, security, and operational (deployment, infrastructure) requirements.
