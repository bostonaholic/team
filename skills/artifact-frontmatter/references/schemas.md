# Artifact schemas

Read only the section for the artifact being written.

## Common

```yaml
---
topic: <kebab-topic>
date: <YYYY-MM-DD>
phase: <task|questions|prd|repos|research|design|design-review|structure|plan|implementation|pr|cross-model-review|cross-model-raw>
---
```

## Task

```markdown
---
topic: <kebab-topic>
date: <YYYY-MM-DD>
phase: task
ticketId: <id-or-null>
workflow: <team|team-fix>
---

# Task: <topic>

## Request
<resolved user description>
```

## Design review

```yaml
---
topic: <kebab-topic>
date: <YYYY-MM-DD>
phase: design-review
verdict: <APPROVE|REQUEST CHANGES|COMMENT>
---
```

## Implementation

```markdown
---
topic: <kebab-topic>
date: <YYYY-MM-DD>
phase: implementation
verdict: PASS
---

# Implementation

## Verified heads
- home: <40-character-git-sha>
- <repo-slug>: <40-character-git-sha>

## Review notes
- [<reviewer>] <Minor-or-below finding>
```

Omit `## Review notes` when empty.

## PR

```markdown
---
topic: <kebab-topic>
date: <YYYY-MM-DD>
phase: pr
status: opened
---

# Pull Requests

## Pull requests
- home: https://github.com/<owner>/<repo>/pull/<number>
- <repo-slug>: <url>

## Heads
- home: <final-head-sha>
- <repo-slug>: <final-head-sha>
```

`## Pull requests` lists repos with opened drafts. `## Heads` lists every
worktree, including repos that needed no PR.

## Repositories

```markdown
---
topic: <kebab-topic>
date: <YYYY-MM-DD>
phase: repos
---

# Repos: <topic>

## Home repo
- **name:** <slug>
- **path:** <absolute-path>
- **role:** <one sentence>

## Additional repos
- **name:** <slug>
  **path:** <absolute-path>
  **role:** <one sentence>

## Worktrees
- home: <absolute-worktree-path>
- <slug>: <absolute-worktree-path>
```

## PRD

```yaml
---
topic: <kebab-topic>
date: <YYYY-MM-DD>
phase: prd
---
```
