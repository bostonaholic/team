# Conditional artifact schemas

## `4-repos.md`

Write this only when a topic touches more than one repository. Its presence enables multi-repo mode under `skills/worktree-isolation/SKILL.md`; absence means single-repo. The home worktree is created in leading WORKTREE, secondary worktrees after design review.

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: repos
---

# Repos: <topic>

## Home repo
- **name:** <short-slug>
- **path:** <absolute-path>
- **role:** One sentence describing what kind of work happens here.

## Additional repos
- **name:** <short-slug>
  **path:** <absolute-path>
  **role:** One sentence describing what kind of work happens here.
- **name:** <short-slug>
  **path:** <absolute-path>
  **role:** ...

## Worktrees
<written by the orchestrator after design review; back-records the home worktree plus secondary paths>
- home: <home-worktree-path>
- <repo-name>: <repo-path>/.claude/worktrees/<id>
- ...
```

Names are unique short slugs such as `frontend`, `api`, or `shared-types`, used as `[repo: api]`. Paths are absolute git working trees. The invocation repo is home and alone owns canonical `docs/plans/<id>/`; secondary worktrees do not duplicate artifacts. The questioner/design-author lists repos but MUST NOT write `## Worktrees`; the orchestrator adds it after design review.

## `3-prd.md`

The questioner writes `docs/plans/<id>/3-prd.md` when `skills/product-requirements-doc/SKILL.md` applies: vague, multi-story, cross-cutting, or behavior-replacing work. `1-task.md` references it. It is autonomous and ungated.

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: prd
---
```
