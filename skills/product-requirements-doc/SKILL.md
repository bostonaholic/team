---
name: product-requirements-doc
description: Optional PRD methodology — loaded by the questioner agent when a feature request is vague or complex enough to warrant a structured product spec alongside task.md. Produces a PRD artifact that downstream design-author work can ground decisions in.
---

# Product Requirements Document

A PRD translates a vague or complex feature request into a structured artifact
that complements `task.md`. The questioner produces it when intent is rich
enough to need explicit scope, acceptance criteria, and constraints, rather
than a one-page task summary alone.

The goal is precision, not exhaustive documentation: clear scope, unambiguous
acceptance criteria, and explicit boundaries that prevent scope creep when
the design-author later turns the task into an approach.

## When to Write a PRD

The questioner produces a PRD (in addition to the standard `task.md`,
`questions.md`, and `brief.md`) when the feature request is:

- **Vague or underspecified** — the request does not say what "done" looks
  like ("improve the onboarding experience" has no clear scope boundary)
- **Complex with multiple user stories** — more than one user type, more
  than one distinct workflow, or multiple independent but related capabilities
- **Cross-cutting** — the feature touches multiple subsystems and the
  interaction between them needs explicit specification
- **Replacing or significantly changing existing behavior** — where the
  scope of "existing" needs to be defined before research can begin

For simple, well-scoped requests ("add a `--verbose` flag to the CLI"), the
standard `task.md` is sufficient — no PRD needed.

## PRD Structure

Write the PRD to `docs/plans/YYYY-MM-DD-<topic>-prd.md`. Reference its path
from `task.md` so the design-author knows to read it.

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

## Consuming a PRD downstream

When the design-author finds a PRD path referenced in `task.md`, it should:

1. **Read the PRD first.** The PRD supersedes any ambiguity in the original
   feature request.
2. **Map acceptance criteria to design decisions.** Each criterion grounds
   one or more decisions in the design document.
3. **Use the scope boundaries as the scope fence.** Subsequent structure +
   plan must not add slices for out-of-scope items.

When the structure-planner reads the design, the PRD's acceptance criteria
become the source of vertical-slice acceptance tests.

## Rules

- **PRDs describe behavior, not implementation.** The PRD tells the design
  author *what* users need; the design tells the implementer *how* to build it.
- **Every acceptance criterion must be testable.** If you cannot write a
  test for it, it is not an acceptance criterion — it is an aspiration.
- **Scope boundaries are commitments.** Out-of-scope means out-of-scope
  for this feature, regardless of how easy it seems to add.
- **The PRD belongs to the questioner.** The design-author may surface
  questions about acceptance criteria interactively but may not change them
  unilaterally.
