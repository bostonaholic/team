---
name: planning-implementation
description: 'Defines planning implementation methodology. Load when agents need its procedure.'
user-invocable: false
---

# Planning Implementation

Expand each vertical slice from `7-structure.md` into precise file-level steps and acceptance-test mappings.

## Plan structure

Write `8-plan.md` as:

```markdown
# Plan: <topic>

## Context
<2-3 sentences summarizing the change and referencing the structure path. In multi-repo mode, list slugs and worktree paths from 4-repos.md `## Worktrees` so the implementer knows where to cd.>

## Slices

### Slice 1: <name from 7-structure.md>

**Repos:** <multi-repo only; comma-separated slugs>
**Acceptance tests** (from 7-structure.md):
- `test_name_1` — what it asserts
  (multi-repo: `<repo>:test_name_1`)
- `test_name_2` — what it asserts

**Steps:**
1. `path/to/file.ts` — <add/modify/remove; cite patterns by file:line; mark `[parallel]` or `[sequential]`. Multi-repo prefix: `[repo: api] path/to/file.ts`; the implementer cd's into that worktree.>
2. `path/to/other.ts` — ...

**Verification:** Run `<command>`. Done means this slice and all prior acceptance tests pass.
<Multi-repo: one command per repo, scoped to its worktree.>

**Commit:** `<conventional-commit subject for this slice>`
<Multi-repo slice: one Commit per repo; the implementer creates one per repo with shared slice context in each body.>

### Slice 2: <name>
...

## Done Criteria
- All acceptance tests for every slice pass
- No regressions in existing tests
- Any feature-specific criteria pass
- Multi-repo: each worktree contains only this topic's commits; no incidental edits
```

## Tactical rules

1. Slices execute sequentially; steps inside one slice may parallelize. Commit each slice atomically.
2. Reuse functions, utilities, and patterns from `5-research.md`.
3. Keep the plan under 300 lines.
4. Include no implementation code; state what and where, leaving actual code to the implementer.
5. Every slice leaves the codebase working with its acceptance tests passing.
6. Add no tests beyond the structure; `7-structure.md` is the scope fence.
