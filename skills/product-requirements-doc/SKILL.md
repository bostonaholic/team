---
name: product-requirements-doc
description: Product requirements document methodology — loaded by the product-owner agent when feature requests are vague or complex, enabling structured discovery and PRD artifact production for the planner to consume
---

# Product Requirements Document

A PRD translates a vague or complex feature request into a structured artifact
the planner can act on without ambiguity. The goal is not exhaustive
documentation — it is precision: clear scope, unambiguous acceptance criteria,
and explicit boundaries that prevent scope creep and wrong assumptions.

## When to Write a PRD

The product-owner agent produces a PRD (instead of just resolving ambiguity
decisions inline) when the feature request is:

- **Vague or underspecified** — the request does not say what "done" looks
  like ("improve the onboarding experience" has no clear scope boundary)
- **Complex with multiple user stories** — more than one user type, more than
  one distinct workflow, or multiple independent but related capabilities
- **Cross-cutting** — the feature touches multiple subsystems and the
  interaction between them needs explicit specification
- **Replacing or significantly changing existing behavior** — where the
  scope of "existing" needs to be defined before implementation can begin

For simple, well-scoped requests ("add a `--verbose` flag to the CLI"), inline
ambiguity resolution is sufficient — no PRD needed.

## PRD Structure

Write the PRD to `docs/plans/YYYY-MM-DD-<topic>-prd.md`.

### Problem Statement

One to three sentences: what problem does the user have? Why does it exist?
Why does it matter to solve it now? Ground every subsequent section in this.

### User Stories

Enumerate the user workflows the feature must support. Use this format:

```
As a [user type], I want to [action], so that [outcome].
```

Every user story that is in scope gets listed. User stories that are
explicitly out of scope get listed in Non-Goals. Stories that might be
in scope later get listed in Future Scope.

Keep stories at the "what" level, not the "how" level. "As a developer,
I want to see syntax errors highlighted in the editor" is a story.
"As a developer, I want the parser to return an AST node with error
metadata" is an implementation detail.

### Acceptance Criteria

For each user story, define the conditions that prove it is implemented
correctly. Acceptance criteria are written as verifiable statements:

```
GIVEN [initial context]
WHEN [user action]
THEN [expected outcome]
```

Or as a checklist when the story is simple:

```
- [ ] The user can do X without doing Y first
- [ ] Doing X with invalid input shows error message Z
- [ ] Doing X is reflected in the audit log within 1 second
```

Acceptance criteria must be:
- **Testable** — can be verified by running a test or observing behavior
- **Unambiguous** — only one interpretation is possible
- **Complete** — cover happy path, error cases, and edge cases

### Scope Boundaries

Explicit statement of what is and is not in scope.

**In Scope:**
- List every feature, behavior, or capability that must be delivered

**Out of Scope:**
- List everything that is explicitly excluded — even obvious things if
  they might be assumed. "Does not support X" is more valuable than silence.

**Future Scope:**
- Desirable features that are deliberately deferred. Capturing them here
  prevents them from being lost while keeping them out of the current scope.

### Constraints

Non-negotiable requirements the implementation must satisfy:

- **Performance:** response time, throughput, latency budgets
- **Compatibility:** API versioning, backward compatibility, browser support
- **Security:** authentication, authorization, data handling requirements
- **Operational:** deployment constraints, infrastructure requirements

## Consuming a PRD as the Planner

When the planner finds a PRD artifact in `docs/plans/`, it should:

1. **Read the PRD first.** The PRD supersedes any ambiguity in the original
   feature request.
2. **Map acceptance criteria to plan steps.** Each acceptance criterion
   should correspond to one or more steps in the plan.
3. **Use the scope boundaries as the scope fence.** The plan must not add
   steps for out-of-scope items, even if they seem related or easy to add.
4. **Map acceptance criteria to acceptance tests.** Each criterion becomes
   a named acceptance test in the Tests section of the plan.
5. **Reference the PRD in the Context section.** Cite the PRD path so
   reviewers can trace plan decisions back to product decisions.

## Rules

- **PRDs describe behavior, not implementation.** The PRD tells the planner
  *what* users need; the plan tells the implementer *how* to build it.
- **Every acceptance criterion must be testable.** If you cannot write a
  test for it, it is not an acceptance criterion — it is an aspiration.
- **Scope boundaries are commitments.** Out-of-scope means out-of-scope
  for this feature, regardless of how easy it seems to add.
- **The PRD belongs to the product-owner.** The planner may ask for
  clarification on acceptance criteria but may not change them unilaterally.
- **Surface questions through the interview gate.** When the product-owner's
  confidence is below 95%, open questions are surfaced to the user via the
  router's interview gate — not asked directly by the product-owner agent.
  See the product-owner agent for the confidence assessment method.
