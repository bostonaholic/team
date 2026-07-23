---
name: planning-implementation
description: Tactical planning methodology for the planner agent — the plan.md document template that expands each vertical slice into file-level steps, and the tactical rules that keep the plan scannable and scoped. Loaded when a structure is translated into the implementer's playbook.
user-invocable: false
---

# Planning Implementation

The planner's methodology: expand each vertical slice from the structure
into precise file-level steps with acceptance-test mappings.

## Plan structure

The body of `plan.md`:

```markdown
# Plan: <topic>

## Context

Two to three sentences summarizing the change. Reference the approved
structure by path. In multi-repo mode, list the repo slugs and their
worktree paths (read from repos.md `## Worktrees` once the worktrees
exist) so the implementer knows where to cd for each step.

## Slices

For each slice from structure.md, expand it into file-level steps.

### Slice 1: <name from structure.md>

**Repos:** <multi-repo only — comma-separated repo slugs>
**Acceptance tests** (from structure.md):
- `test_name_1` — what it asserts
  (multi-repo: `<repo>:test_name_1`)
- `test_name_2` — what it asserts

**Steps:**

1. `path/to/file.ts` — <what to add/modify/remove. Reference patterns to
   follow with file:line. Mark as `[parallel]` or `[sequential]`.>
   (multi-repo: prefix the file path with the repo slug, e.g.
   `[repo: api] path/to/file.ts` — the implementer cd's into that repo's
   worktree before applying the step)

2. `path/to/other.ts` — ...

**Verification:** Run `<command>`. The slice is done when its acceptance
tests pass and prior slices' tests still pass.
(multi-repo: list one verification command per repo, scoped to that
repo's worktree)

**Commit:** `<conventional-commit subject for this slice>`
(multi-repo: when the slice spans repos, list one **Commit** per repo;
the implementer creates one commit per repo, all with the same slice
context referenced in the body)

### Slice 2: <name>
...

## Done Criteria

- All acceptance tests for every slice pass
- No regressions in existing tests
- Any additional criteria specific to this feature
- (multi-repo) every involved repo's worktree has only the commits this
  topic produced — no incidental edits in other repos
```

## Tactical rules

1. **One slice at a time.** Steps within a slice may parallelize, but slices
   themselves are sequential. The implementer commits each slice atomically.
2. **Reuse, don't reinvent.** Reference existing functions, utilities, and
   patterns from research.md.
3. **Stay under 300 lines.** The plan must be scannable in one sitting.
4. **No implementation code.** Describe *what* to build and *where*. Leave
   *how* (the actual code) to the implementer.
5. **Atomic slices.** Each slice should leave the codebase in a working
   state with its acceptance tests passing.
6. **Test coverage matches the structure.** Do not add tests beyond what the
   structure specifies — the structure is the scope fence.
