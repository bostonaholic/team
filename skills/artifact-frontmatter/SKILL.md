---
name: artifact-frontmatter
description: The artifact schema contract for docs/plans/<id>/ — the artifact inventory, the YAML frontmatter schema and phase enum, the repos.md and prd.md schemas, the topic-consistency invariant, ticketId scope, and the design-review record mechanics. Load when authoring or validating a pipeline artifact's frontmatter, checking the design-review verdict, or writing repos.md or prd.md.
user-invocable: false
---

# Artifact Frontmatter

The single schema contract for the pipeline's durable state: every
artifact under `docs/plans/<id>/`, its YAML frontmatter, and the
design-review record mechanics that gate the DESIGN transition. Phase discipline — what
each phase does and when it advances — lives in
`skills/qrspi-workflow/SKILL.md`; this skill owns the schema.

## Artifact inventory

All phase artifacts live under `docs/plans/<id>/`, where `<id>` is one of:

- **Ticket-prefixed**: `<TICKET>-<kebab-topic>` (e.g.,
  `ENG-1234-add-rate-limiting`)
- **Date-prefixed**: `<YYYY-MM-DD>-<kebab-topic>` (e.g.,
  `2026-05-01-add-rate-limiting`)

The executable definitions of the `<id>` pattern (`ID_RE`) and the
phase-file list (`PHASE_FILES`) live in
`hooks/session-start-recover.mjs` — that hook is the canon; reference
it rather than forking the pattern here.

| Artifact  | Path                              | Created By              | Required? |
|-----------|-----------------------------------|-------------------------|-----------|
| Task      | `docs/plans/<id>/task.md`         | questioner agent        | yes       |
| Questions | `docs/plans/<id>/questions.md`    | questioner agent        | yes       |
| PRD       | `docs/plans/<id>/prd.md`          | questioner agent        | when PRD criteria apply |
| Repos     | `docs/plans/<id>/repos.md`        | questioner / design-author | when topic spans repos |
| Research  | `docs/plans/<id>/research.md`     | researcher agent        | yes       |
| Design    | `docs/plans/<id>/design.md`       | design-author agent     | yes       |
| Structure | `docs/plans/<id>/structure.md`    | structure-planner agent | yes       |
| Plan      | `docs/plans/<id>/plan.md`         | planner agent           | yes       |

The `<id>` slug should match across every artifact for the same feature.

## Frontmatter schema (all artifacts)

Every artifact opens with YAML frontmatter. Common fields:

```yaml
---
topic: <kebab-case>
date: 2026-04-30
phase: design        # task | questions | prd | repos | research | design | structure | plan
---
```

Per-phase additions:

| Phase     | Extra frontmatter                                                                  |
|-----------|------------------------------------------------------------------------------------|
| task      | `ticketId: <id>` (or `null`)                                                       |
| questions | (none)                                                                             |
| prd       | (none — not gated; written conditionally by the questioner)                        |
| repos     | (none — written conditionally in multi-repo mode)                                  |
| research  | (none)                                                                             |
| design    | `revision: 0`                                                                      |
| structure | (none — not gated; advances to PLAN once it exists)                                |
| plan      | (none — derived mechanically from the structure)                                   |

**Design-review record** (`design-review-<n>.md`): each review round the
orchestrator writes `docs/plans/<id>/design-review-<n>.md` (`<n>` = the
highest existing `<n>` + 1, or 1 when none exists) with frontmatter
`topic`, `date`, `phase: design-review`, and
`verdict: <APPROVE|REQUEST CHANGES|COMMENT>`. The body carries the
reviewer's findings and verdict verbatim. The `verdict` field is the
deterministic read for hooks and resume detection (it replaces the
retired `^approved:` frontmatter grep). A design has **passed review**
when the highest-`<n>` file carries APPROVE or COMMENT.

**Review loop**: on REQUEST CHANGES, the orchestrator re-dispatches
`design-author` with the reviewer's findings verbatim; the new draft
increments `revision: <n+1>` in its frontmatter and a fresh review round
runs. Cap at 5 revisions; at cap, the run halts terminally and reports
the unresolved findings — no consultation, no PR.

## Topic consistency invariant

Every artifact's `topic` frontmatter field MUST be identical across all
artifacts in the same `docs/plans/<id>/` directory. The `topic` value
is the kebab portion of `<id>` — i.e. `<id>` minus the `<TICKET>-` or
`<YYYY-MM-DD>-` prefix:

| `<id>`                                  | `topic`                       |
|-----------------------------------------|-------------------------------|
| `ENG-9876-cache-invalidation`           | `cache-invalidation`          |
| `2026-05-01-add-rate-limiting`          | `add-rate-limiting`           |

Never use the ticket id, the date, or a re-worded description as the
topic. Downstream agents copy the topic verbatim from upstream
artifacts; the questioner is the one place where it is chosen.

## ticketId scope

`ticketId` lives **only on `task.md`**. It does not appear on
`questions.md`, `research.md`, `design.md`, `structure.md`, or
`plan.md`. The rationale: the directory name `<id>` already encodes
the ticket prefix, and `task.md` is the canonical intent record. Re-
encoding `ticketId` on every artifact would be duplication that can
drift out of sync with the directory name.

## Repos artifact (`repos.md`)

When a topic touches **more than one repository**, the questioner or
design-author writes `docs/plans/<id>/repos.md` to enumerate the repos
involved. The presence of this file switches the pipeline into multi-repo
mode (one worktree per listed repo, see
`skills/worktree-isolation/SKILL.md`); the home worktree is created at the
leading WORKTREE phase and secondary worktrees after the design review. Its
absence keeps the pipeline in single-repo mode — today's default.

`repos.md` schema:

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
<written by the orchestrator after the design review; back-records the home worktree path created at the leading WORKTREE phase plus each secondary path>
- home: <home-worktree-path>
- <repo-name>: <repo-path>/.claude/worktrees/<id>
- ...
```

Rules:

- **Names are short slugs** (e.g. `frontend`, `api`, `shared-types`) used
  in slice and plan annotations like `[repo: api]`. Names must be unique
  across `repos.md`.
- **Paths are absolute.** Each must be a git working tree.
- **The home repo is the one the user invoked `/team` from.** Its
  `docs/plans/<id>/` directory is the canonical artifact location;
  other repos' worktrees do not carry duplicate artifacts.
- **The `## Worktrees` section is written by the orchestrator** after the
  design review (back-recording the home worktree created at the leading
  WORKTREE phase plus each secondary worktree), not by the questioner or
  design-author. Until then, `repos.md` lists only the repos to be involved.

## PRD artifact (`prd.md`)

Written conditionally by the questioner when the PRD criteria in
`skills/product-requirements-doc/SKILL.md` apply (vague, multi-story,
cross-cutting, or behavior-replacing requests), and referenced from
`task.md`. It rides the autonomous Question phase — not gated, so
no `approved`/`revision` fields.

`prd.md` frontmatter:

```yaml
---
topic: <kebab-case-topic>
date: <YYYY-MM-DD>
phase: prd
---
```
