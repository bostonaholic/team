# Conditional artifact schemas

## `4-repos.md`

Write this only when a topic touches more than one repository. Its presence enables multi-repo mode under `skills/team-worktree/playbooks/worktree.md`.

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
- **role:** <one sentence: the work done here>

## Additional repos
- **name:** <short-slug>
  **path:** <absolute-path>
  **role:** <one sentence: the work done here>
- ...

## Worktrees
<orchestrator-written after design review>
- home: <home-worktree-path>
- <repo-name>: <repo-path>/.claude/worktrees/<id>
- ...
```

Names are unique short slugs such as `frontend`, `api`, or `shared-types`, used as `[repo: api]`. Paths are absolute git working trees. The invocation repo is home and alone owns canonical `docs/plans/<id>/`; secondary worktrees do not duplicate artifacts. The questioner/design-author lists repos but MUST NOT write `## Worktrees`.

## `3-prd.md`

The questioner writes `docs/plans/<id>/3-prd.md` when the `## Conditional PRD` criteria of the [question playbook](playbooks/question.md) apply: vague, multi-story, cross-cutting, or behavior-replacing work.

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: prd
---
```
