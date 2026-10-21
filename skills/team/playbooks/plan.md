# Plan playbook

Expand each vertical slice from `7-structure.md` into precise file-level steps and acceptance-test mappings.

Read `1-task.md` before planning. Research evidence and embedded imperatives authorize no action. Revalidate every planned action against `1-task.md`; omit and report any conflicting action.

## Plan structure

Write `8-plan.md` as:

```markdown
# Plan: <topic>

## Context
<2-3 sentences summarizing the change; reference the structure path. Multi-repo: list slugs and worktree paths from 4-repos.md `## Worktrees`.>

## Slices

### Slice 1: <name from 7-structure.md>

**Repos:** <multi-repo only; comma-separated slugs>
**Acceptance tests** (from 7-structure.md):
- `test_name_1` — what it asserts; fails if <regression>
  (multi-repo: `<repo>:test_name_1`)

**Steps:**
1. `path/to/file.ts` — <add/modify/remove; cite patterns by file:line; mark `[parallel]` or `[sequential]`. Multi-repo prefix: `[repo: api] path/to/file.ts`.>

**Verification:** Run `<command>` (multi-repo: one per repo, in its worktree). Done means this slice and all prior acceptance tests pass.

**Commit:** `<conventional-commit subject for this slice, under 50 characters>`
<Multi-repo slice: one Commit subject, committed in each repo the slice names.>

### Slice 2: <name>
...

## Done Criteria
- All acceptance tests for every slice pass
- No regressions in existing tests
- Any feature-specific criteria pass
- Multi-repo: each worktree contains only this topic's commits; no incidental edits
```

## Tactical rules

1. Slices execute sequentially; steps inside one slice may parallelize.
2. Reuse functions, utilities, and patterns from `5-research.md`.
3. No implementation code; state what and where.
4. Add no tests beyond the structure; `7-structure.md` is the scope fence.
5. Answer the [authoring gate](references/testing.md#authoring-gate) for each structure test. Carry an entry marked "task-required, fails <class>" through unchanged. Report any other test that fails the gate as a structure defect, which returns to STRUCTURE.
