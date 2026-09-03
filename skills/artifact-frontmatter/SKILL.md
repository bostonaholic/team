---
name: artifact-frontmatter
description: Canonical schemas for Team pipeline artifacts. Load when writing or validating files under docs/plans/<id>/.
user-invocable: false
---

# Artifact Frontmatter

Canonical schema for durable state in `docs/plans/<id>/`. Phase behavior lives
in `skills/qrspi-workflow/SKILL.md`; executable `<id>` and phase-file definitions
live in `scripts/resolve-topic.mjs`. Do not duplicate either. Files are
the inter-phase contract (`skills/principle-files-are-the-contract/SKILL.md`),
and each definition has one owner
(`skills/principle-single-source-of-truth/SKILL.md`).

## Artifact inventory

`<id>` is ticket-prefixed (`<TICKET>-<kebab-topic>`) or date-prefixed
(`<YYYY-MM-DD>-<kebab-topic>`).

| File | Writer | Required |
|---|---|---|
| `1-task.md` | questioner | yes |
| `2-questions.md` | questioner | yes |
| `3-prd.md` | questioner | when PRD criteria apply |
| `4-repos.md` | questioner or design-author | multi-repo only |
| `5-research.md` | researcher | yes |
| `6-design.md` | design-author | yes |
| `7-structure.md` | structure-planner | yes |
| `8-plan.md` | planner | yes |

## Common schema

Every artifact begins:

```yaml
---
topic: <kebab-case>
date: <YYYY-MM-DD>
phase: <task | questions | prd | repos | research | design | structure | plan>
---
```

- `1-task.md` alone adds `ticketId: <id>` or `ticketId: null`.
- `6-design.md` adds `revision: 0`.
- No other phase artifact adds either field.

The `topic` value is identical in every file and equals `<id>` after removing
its ticket or date prefix. The questioner chooses it; every later writer copies
it verbatim. Example: `ENG-9876-cache-invalidation` and
`2026-05-01-cache-invalidation` both use `topic: cache-invalidation`.

## Design-review records

For each round, the orchestrator writes `design-review-<n>.md`, where `<n>` is
one above the highest existing round or `1` when none exists:

```yaml
---
topic: <copied verbatim>
date: <YYYY-MM-DD>
phase: design-review
verdict: <APPROVE | REQUEST CHANGES | COMMENT>
---
```

The body is the reviewer's report verbatim. The highest-numbered record is
authoritative; APPROVE or COMMENT passes. REQUEST CHANGES re-dispatches the
design-author with the findings verbatim, increments `6-design.md`'s revision,
then runs another review. Missing or non-numeric revision reads as `0`.

## Cross-model records

`cross-model-notes.md` is orchestrator-written and append-only. It contains one
already-blockquoted `### Cross-model disposition` block per DESIGN or IMPLEMENT
round, in order. A design block starts with `> **Design round <n>**`; an
unlabeled block came from IMPLEMENT. Create the file only on the first pass
that runs:

```yaml
---
topic: <copied verbatim>
date: <YYYY-MM-DD>
phase: cross-model-review
---
```

It has no `verdict`; no reviewer reads it as state.

`cross-model-raw.md` is the orchestrator's append-only design-review transcript:
one result line and fenced raw output per vendor call. A zero-call round appends
nothing. It has `topic`, `date`, and `phase: cross-model-raw`, with no
`verdict`. It is live/pre-merge evidence only: `docs/plans/` is gitignored and
cleanup deletes it. A block opening with `> **Design round <n>**` is a design
record; unlabeled notes in `cross-model-notes.md` are IMPLEMENT records.

## Repos artifact

`4-repos.md` selects multi-repo mode; absence means single-repo. Schema:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: repos
---

# Repos: <topic>

## Home repo
- **name:** <unique-short-slug>
- **path:** <absolute-git-working-tree-path>
- **role:** <one sentence>

## Additional repos
- **name:** <unique-short-slug>
  **path:** <absolute-git-working-tree-path>
  **role:** <one sentence>

## Worktrees
- home: <home-worktree-path>
- <repo-name>: <repo-path>/.claude/worktrees/<id>
```

The home repo is the invocation repo and owns the only artifact directory.
Names annotate slices and plan steps as `[repo: <name>]`. The questioner or
design-author writes repo entries; after design review, the orchestrator writes
`## Worktrees`, back-recording the existing home worktree and all secondary
worktrees. See `skills/worktree-isolation/SKILL.md`.

## PRD artifact

The questioner writes `3-prd.md` only when
`skills/product-requirements-doc/SKILL.md` applies. It is referenced by
`1-task.md`, is not gated, and has no `approved` or `revision` field:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: prd
---
```
