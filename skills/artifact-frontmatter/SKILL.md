---
name: artifact-frontmatter
description: Apply when creating or validating Team pipeline artifacts. Defines the docs/plans/<id>/ inventory, shared YAML fields, phase completion records, topic identity, and conditional repository and PRD schemas.
user-invocable: false
---

# Artifact Frontmatter

Artifacts are the durable interface between phases. Put them in
`docs/plans/<id>/`, where `<id>` is `<TICKET>-<kebab-topic>` or
`<YYYY-MM-DD>-<kebab-topic>`. Before writing one, read `## Common` and its
artifact-specific section, when present, in `references/schemas.md`.

Resolve an exact ID across the invoking checkout and its git worktrees with
`scripts/resolve-topic.mjs <repo-root> <id>`. Standalone readers use its
`discover <repo-root> <predecessor>` mode and send the raw optional directory
argument on stdin. An explicit valid directory wins; otherwise it returns the
newest matching topic, or `needs-input`. No other skill implements discovery.

Apply `skills/principle-files-are-the-contract/SKILL.md` and
`skills/principle-single-source-of-truth/SKILL.md`.

## Inventory

| Phase | Required output | Writer |
| --- | --- | --- |
| Worktree | `1-task.md` | team-worktree |
| Question | `2-questions.md` | questioner |
| Research | `5-research.md` | team-research |
| Design | `6-design.md`, `design-review-<n>.md` | design-author, team-design |
| Structure | `7-structure.md` | structure-planner |
| Plan | `8-plan.md` | planner |
| Implement | `9-implementation.md` | team-implement |
| PR | `10-pr.md` | team-pr |

`3-prd.md` is conditional. `4-repos.md` exists only for multi-repo work.
`cross-model-notes.md`, `cross-model-raw.md`, and screenshots are supporting
records, never phase-completion signals.

## Shared rules

- Every artifact starts with closed YAML frontmatter containing `topic`,
  `date`, and its allowed `phase` from `references/schemas.md`.
- Copy `topic` verbatim from the predecessor. It is the `<id>` suffix after
  the ticket or date prefix. Never reword it.
- `1-task.md` alone carries `ticketId` and `workflow: team|team-fix`, followed
  by the full resolved request. A missing workflow means `team` for migration.
- Never overwrite a valid completed artifact. Optional artifacts never advance
  phase state.

## Gate records

- Design reviews are append-only `design-review-<n>.md` files with
  `phase: design-review` and `verdict: APPROVE|REQUEST CHANGES|COMMENT`. The
  highest number controls; only APPROVE and COMMENT pass. Missing or malformed
  records fail closed.
- Write `9-implementation.md` only after every Blocking and Major finding is
  closed. It carries `phase: implementation`, `verdict: PASS`, every
  worktree's exact 40-character SHA under `## Verified heads`, and optional
  Minor-and-below findings under `## Review notes`. A missing or changed HEAD
  invalidates it.
- Write `10-pr.md` after final PR body edits. It carries `phase: pr`,
  `status: opened`, every opened draft URL, and every worktree's final HEAD.
  A missing or changed HEAD invalidates it. Recover an existing open PR before
  creating one; never duplicate it.

## Conditional records

- `4-repos.md` (`phase: repos`) uses unique repo slugs and absolute paths. Its
  single `## Worktrees` map includes `home` and every secondary checkout. The
  home repo owns the only artifact directory.
- `3-prd.md` (`phase: prd`) has no approval or revision fields.
- `cross-model-notes.md` uses `phase: cross-model-review`; the orchestrator or
  owning module appends completed dispositions as blockquotes. Design rounds
  start with `> **Design round <n>**`. `cross-model-raw.md` uses
  `phase: cross-model-raw` for raw design-review transcripts. Neither carries
  a verdict or controls resume.
