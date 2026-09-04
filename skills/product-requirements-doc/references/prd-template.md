# PRD template

## Problem Statement

In 1–3 sentences, state the user's problem, its cause, and why it matters now. Ground all later sections in it.

## User Stories

List every in-scope workflow:

```text
As a [user type], I want to [action], so that [outcome].
```

Put excluded stories in Non-Goals and possible later stories in Future Scope. Stay at “what,” never “how.” For example, syntax errors highlighted in an editor is behavior; parser AST error metadata is implementation.

## Acceptance Criteria

For each story, use:

```text
GIVEN [initial context]
WHEN [user action]
THEN [expected outcome]
```

For simple cases, use a checklist:

```text
- [ ] The user can do X without doing Y first
- [ ] Doing X with invalid input shows error message Z
- [ ] Doing X is reflected in the audit log within 1 second
```

Every criterion is testable, unambiguous, and complete across happy paths, errors, and edge cases.

## Scope Boundaries

**In Scope:** every required feature, behavior, and capability.

**Out of Scope:** every exclusion that readers might otherwise assume.

**Future Scope:** desirable deferred features, recorded without entering current scope.

## Constraints

State non-negotiable performance (response time, throughput, latency), compatibility (API versions, backward compatibility, browsers), security (authentication, authorization, data handling), and operational (deployment, infrastructure) requirements.
