---
name: planning-implementation
description: Expand 7-structure.md into file-level 8-plan.md steps, tests, verification, and commits. Loaded by planner.
user-invocable: false
---

# Planning Implementation

## Input

Read `7-structure.md`, `5-research.md`, and, in multi-repo mode, the worktree
paths in `4-repos.md`.

## Required plan

Write `8-plan.md`:

```markdown
# Plan: <topic>

## Context
<2–3 sentences; cite 7-structure.md. In multi-repo mode list repo slugs and worktrees.>

## Slices

### Slice 1: <7-structure.md name>
**Repos:** <multi-repo only>
**Acceptance tests:**
- <exact test from 7-structure.md; prefix with repo when multi-repo>

**Steps:**
1. [repo: <slug>] path/to/file — <precise change and file:line precedent;
   mark parallel or sequential>

**Verification:** <command per affected repo; new and prior tests must pass>
**Commit:** <Conventional Commit subject per affected repo>

## Done Criteria
- Every planned acceptance test passes
- Existing tests pass
- Feature-specific criteria pass
- Multi-repo worktrees contain no incidental edits
```

## Rules

- Preserve slice order; parallelize only steps within a slice.
- One atomic commit per slice and repo.
- Reference existing code; include no implementation code.
- Keep the plan under 300 lines.
- Add no tests beyond `7-structure.md`; it is the scope fence.

## Done

Every structure slice maps to explicit files, acceptance tests, verification,
and commits.
