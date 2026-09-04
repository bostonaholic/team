---
name: artifact-frontmatter
description: 'Defines pipeline artifact schemas. Load when authoring or validating artifact frontmatter, `4-repos.md`, `3-prd.md`, or design-review records.'
user-invocable: false
---

# Artifact Frontmatter

This is the schema contract for durable pipeline state under `docs/plans/<id>/`. Phase behavior lives in `skills/qrspi-workflow/SKILL.md`; files are the phase interface (`principle-files-are-the-contract`).

## Artifact inventory

`<id>` is `<TICKET>-<kebab-topic>` (for example `ENG-1234-add-rate-limiting`) or `<YYYY-MM-DD>-<kebab-topic>` (for example `2026-05-01-add-rate-limiting`). `hooks/session-start-recover.mjs` owns executable `ID_RE` and `PHASE_FILES` definitions (`principle-single-source-of-truth`).

| Artifact | Path | Created by | Required |
|---|---|---|---|
| Task | `docs/plans/<id>/1-task.md` | questioner | yes |
| Questions | `docs/plans/<id>/2-questions.md` | questioner | yes |
| PRD | `docs/plans/<id>/3-prd.md` | questioner | when PRD criteria apply |
| Repos | `docs/plans/<id>/4-repos.md` | questioner/design-author | for multiple repos |
| Research | `docs/plans/<id>/5-research.md` | researcher | yes |
| Design | `docs/plans/<id>/6-design.md` | design-author | yes |
| Structure | `docs/plans/<id>/7-structure.md` | structure-planner | yes |
| Plan | `docs/plans/<id>/8-plan.md` | planner | yes |

## Frontmatter schema

Every artifact starts with `topic: <kebab-case>`, `date: <YYYY-MM-DD>`, and `phase: task | questions | prd | repos | research | design | structure | plan`. Task alone adds `ticketId: <id>` or `null`; design adds `revision: 0`. PRD and structure are not gated; plan derives mechanically from structure.

## Review records

- Never restore the retired `^approved:` frontmatter gate; review records alone determine passage.
- `design-review-<n>.md`: orchestrator-written at the highest existing `<n>` + 1, or 1. Frontmatter is `topic`, `date`, `phase: design-review`, and `verdict: <APPROVE|REQUEST CHANGES|COMMENT>`; body is the verbatim report. Highest-round APPROVE or COMMENT passes. REQUEST CHANGES re-dispatches `design-author` with findings verbatim and increments numeric `revision`; missing/non-numeric means `0`, so the first rewrite writes `revision: 1`.
- `cross-model-notes.md`: orchestrator-written, append-only, one already-blockquoted `### Cross-model disposition` block per DESIGN or IMPLEMENT review round. Frontmatter: copied `topic`, `date`, `phase: cross-model-review`; no `verdict`. A block starting `> **Design round <n>**` is from DESIGN; unlabeled means IMPLEMENT. Create only on first use; reviewers never read it as prior state.
- `cross-model-raw.md`: orchestrator-written, append-only DESIGN capture with one result line plus fenced raw output per vendor call; zero calls append nothing. Frontmatter: copied `topic`, `date`, `phase: cross-model-raw`; no `verdict`. It supports live/pre-merge audit only because `docs/plans/` is gitignored and `/pr-cleanup` deletes the topic directory.

## Topic and ticket invariants

Every artifact in one directory has the identical `topic`: the `<id>` minus its `<TICKET>-` or `<YYYY-MM-DD>-` prefix (`ENG-9876-cache-invalidation` → `cache-invalidation`; `2026-05-01-add-rate-limiting` → `add-rate-limiting`). The questioner chooses it; downstream agents copy it verbatim. Never use the ticket, date, or reworded description.

`ticketId` appears only on `1-task.md`, the canonical intent record; never on `2-questions.md`, `5-research.md`, `6-design.md`, `7-structure.md`, or `8-plan.md`.

## Conditional artifacts

Before writing or validating `4-repos.md` (`phase: repos`) or `3-prd.md` (`phase: prd`), read [references/conditional-artifacts.md](references/conditional-artifacts.md) for their exact templates and ownership rules. `4-repos.md` presence enables multi-repo mode; absence means single-repo. `3-prd.md` is conditional per `skills/product-requirements-doc/SKILL.md`, referenced by `1-task.md`, autonomous, and has no `approved`/`revision`.
