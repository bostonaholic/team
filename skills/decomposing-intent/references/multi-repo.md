# Multi-repo detection and output

Read this before resolving or recording multiple repositories.

## Detection

Suspect multiple repos only when the description names two or more directories/projects, says `across`, `spans`, `in both`, names a contract in another repo, or gives absolute paths/names absent from the current repo. Use `ls` to verify.

Validate every candidate against `^[A-Za-z0-9._-]+$`; reject `.` and `..`, separators, absolute paths, traversal, `$()`, backticks, and shell metacharacters. Pass data as one argv argument. Resolve only sibling directories `<root>/../<name>`. Verify git with `git -C <path> rev-parse --git-dir`. Require `realpath "<root>/../<name>"` to equal `"$(dirname "$(realpath "<root>")")/<name>"`.

All candidates must resolve. Otherwise use single-repo mode, omit `4-repos.md`, and record the named omission in `1-task.md` `## Open assumptions`. Unresolvable includes allowlist failure, missing sibling, non-git directory, and escape from the home repo's parent.

## `4-repos.md`

Use the body schema in `skills/artifact-frontmatter/SKILL.md`. Home is the invocation repo containing `docs/plans/<id>/`; record its absolute path. Every additional repo gets a unique kebab-case slug and absolute path.

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: repos
---
```

Do not write `## Worktrees`; the orchestrator adds it during WORKTREE.
