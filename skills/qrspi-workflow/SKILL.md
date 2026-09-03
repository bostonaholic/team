---
name: qrspi-workflow
description: Define Team's phase order, gates, state reconstruction, and valid transitions. Loaded by pipeline coordinators.
user-invocable: false
---

# QRSPI Workflow

## Phase sequence

`WORKTREE -> QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> IMPLEMENT -> PR`

| Phase | Output | Gate |
|---|---|---|
| WORKTREE | `<id>` worktree from `origin/HEAD`; artifact directory inside it | HARD: worktree exists |
| QUESTION | `1-task.md`, neutral `2-questions.md`, optional `3-prd.md`/`4-repos.md` | HARD: required files exist |
| RESEARCH | `5-research.md` | HARD: file exists |
| DESIGN | `6-design.md`, `design-review-<n>.md` | REVIEW: APPROVE or COMMENT; REQUEST CHANGES re-drafts |
| STRUCTURE | `7-structure.md` | none |
| PLAN | `8-plan.md` | SOFT: no approval |
| IMPLEMENT | code, tests, per-slice commits | aggregate review gate |
| PR | draft pull request | terminal: record URL, close ledger |

WORKTREE is router-owned and first; see `Why first` in
`skills/worktree-isolation/SKILL.md`.

IMPLEMENT runs: test-architect writes failing acceptance tests; a mechanical
gate confirms assertion failures (not crashes) and passing static checks;
implementer commits each passing vertical slice; code, security, docs, UX, and
verification reviews repeat until no Blocking or Major finding remains.

## Artifact contract

All state lives in `docs/plans/<id>/`. Load
`skills/artifact-frontmatter/SKILL.md` for the inventory, schemas, topic rule,
`ticketId` scope, and `4-repos.md`/`3-prd.md` behavior. Do not restate that schema.

## Research isolation

Apply `skills/principle-blind-the-investigator/SKILL.md`:

1. The orchestrator passes researcher and file-finder only `2-questions.md`.
   Never pass the description or `1-task.md`.
2. Their prompts forbid reading `1-task.md`. They have read-only tools and
   `permissionMode: plan`, so this boundary is procedural. Missing context is
   recorded as an open question; they do not pause the run.

Any leak of user intent into research is a critical defect: stop and report.

## Gate types

Apply mechanical checks where possible
(`skills/principle-mechanical-gates/SKILL.md`).

### HARD

Blocks transition until satisfied or until the user explicitly overrides it.
Examples: REQUEST CHANGES, gating security findings, test failures.

### SOFT

Proceeds without acknowledgment. Only findings below the auto-fix boundary go
to the PR body's `## Review notes`; never present them mid-run. The canonical
mapping is `skills/review-severity-tiers/SKILL.md` → "Severity Tiers and the
Auto-Fix Boundary". Do not copy it
(`skills/principle-single-source-of-truth/SKILL.md`). The human reviews the
ends, not the autonomous middle
(`skills/principle-human-owns-the-ends/SKILL.md`).

### ADVISORY

Non-blocking; no acknowledgment required.

## State and transition

Rebuild state from artifacts, not conversation. TodoWrite is only the live
ledger (`skills/principle-files-are-the-contract/SKILL.md`).

| Evidence | Next/current state |
|---|---|
| worktree, no `1-task.md` | WORKTREE |
| `1-task.md` + `2-questions.md` | RESEARCH |
| `5-research.md` | DESIGN |
| `6-design.md`, no passing review | DESIGN review |
| `6-design.md` + highest `design-review-<n>.md` passing | STRUCTURE |
| `7-structure.md` | PLAN |
| `8-plan.md`, no branch commit since merge-base | PLAN |
| `8-plan.md` + branch commit since merge-base | IMPLEMENT |
| branch ahead + latest aggregate `review-<n>.md` clean | PR |
| PR opened or commits shipped | SHIPPED |

Single-repo worktree evidence comes from `git worktree list --porcelain`;
multi-repo evidence comes from every path in `4-repos.md`. A worktree alone never
proves IMPLEMENT; `git log <merge-base>..<id>` must be non-empty.

For every transition:

1. Verify the phase's required artifacts; DESIGN also needs a passing review.
2. Mark the current TodoWrite item complete and the next `in_progress`.
3. Dispatch the agent(s) named by `skills/team/SKILL.md`.

Never advance with a Blocking or Major finding. Auto-fix and re-review without
consulting the user, per `skills/review-severity-tiers/SKILL.md`.

## Invalid transitions

- Never skip QUESTION or expose intent to research.
- Review DESIGN, not the tactical plan.
- Reject horizontal component layers; require end-to-end, testable, atomic
  slices (`skills/slicing-work/SKILL.md`).
- Never implement without `7-structure.md`.
- Do not exceed structure. Update it first; material changes return to DESIGN
  (`skills/principle-scope-fence/SKILL.md`).
- Move backward one phase only.
- Never enter PR before every HARD implementation gate passes.
