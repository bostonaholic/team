---
name: qrspi-workflow
description: 'Defines qrspi workflow methodology. Load when agents need its procedure.'
user-invocable: false
---

# QRSPI Workflow

Eight sequential phases; none are skippable:

```text
WORKTREE -> QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> IMPLEMENT -> PR
```

## Phase Sequence

| Phase | Produces | Gate |
|---|---|---|
| **WORKTREE** | branch `<id>` worktree from `origin/HEAD`; author `docs/plans/<id>/` inside it | HARD: exists before QUESTION |
| **QUESTION** | `1-task.md` (full, human-only) and `2-questions.md` (neutral codebase context; no goal) | HARD: both on disk |
| **RESEARCH** | `5-research.md` | HARD: on disk |
| **DESIGN** | `6-design.md` (~200 lines) and `design-review-<n>.md` each round | REVIEW: APPROVE/COMMENT advance; REQUEST CHANGES redrafts and reviews again |
| **STRUCTURE** | `7-structure.md` (~2 pages, vertical slices) | NONE: autonomous |
| **PLAN** | `8-plan.md` | SOFT: no approval; reviewed design is contract |
| **IMPLEMENT** | code, passing tests, per-slice commits | AGGREGATE: security, verifier, code-review hard gates |
| **PR** | GitHub draft PR | terminal: record URL; close ledger |

WORKTREE is router-owned and has no agent; see “Why first” in `skills/worktree-isolation/SKILL.md`. IMPLEMENT has four sub-phases: test-architect writes failing acceptance tests; a mechanical gate requires assertion failures rather than crashes plus passing static checks; implementer commits green slices; 5 parallel code/security/docs/ux/verifier reviews return typed failures until no Blocking/Major remains.

## Artifact and isolation invariants

`skills/artifact-frontmatter/SKILL.md` owns `<id>`, inventory, `3-prd.md`, `4-repos.md`, topic, and `ticketId` schemas. Topic matches across all artifacts. `4-repos.md` presence enables multi-repo; absence means single-repo. `3-prd.md` is autonomous and ungated.

Research is blind (`principle-blind-the-investigator`). The orchestrator passes researcher/file-finder only `2-questions.md`, never the description or `1-task.md`; their prompts also forbid reading `1-task.md`. They have `Read`/`Grep`/`Glob` with `permissionMode: plan`, so prompt adherence enforces this. Missing context becomes an open question; no user pause. Any intent leak is critical: stop and report.

## Gates

### HARD

Block until satisfied or explicitly overridden by the user. Examples: REQUEST CHANGES, gating security findings, test failures.

### SOFT

Add eligible findings to PR `## Review notes`; never ask mid-run. `skills/review-severity-tiers/SKILL.md` “Severity Tiers and the Auto-Fix Boundary” alone defines gating, auto-fix, and which lower-tier findings qualify (`principle-single-source-of-truth`). Human owns the ends (`principle-human-owns-the-ends`).

### ADVISORY

Non-blocking; no acknowledgment, e.g. documentation-gap analysis or style suggestions. Deterministic checks enforce rules where possible (`principle-mechanical-gates`).

## State and transitions

Files, never conversation memory, are the phase interface (`principle-files-are-the-contract`). Rebuild state from `docs/plans/<id>/*.md` frontmatter and TodoWrite on every `/team-*` entry.

| Latest durable state | Next/current phase |
|---|---|
| worktree exists; no `1-task.md` | WORKTREE |
| `1-task.md` + `2-questions.md` | RESEARCH |
| `5-research.md` | DESIGN |
| `6-design.md`; no passing `design-review-<n>.md` | DESIGN review |
| passing design review | STRUCTURE |
| `7-structure.md` | PLAN |
| `8-plan.md` + ≥1 commit on `<id>` since merge-base | IMPLEMENT |
| `8-plan.md` with no commit on `<id>` yet | PLAN |
| topic commits plus clean verifier | PR |
| PR(s) open or commits shipped | SHIPPED |

Worktree check: `git worktree list --porcelain | grep -q <id>`; multi-repo paths come from `4-repos.md`. Latest `review-<n>.md` records verifier status. Each transition: verify required artifacts (including passing design review), complete/current next TodoWrite items, then dispatch agents named by `skills/team/SKILL.md`.

## Scope and sequencing rules

- Always QUESTION before RESEARCH. Review DESIGN (~200 lines), never tactical PLAN (~1000 lines). STRUCTURE/PLAN are autonomous.
- Reject horizontal database/API/UI layering; slices must be end-to-end, testable, atomic (`skills/slicing-work/SKILL.md`). Never implement without structure.
- Add no feature, test, or abstraction beyond structure. Expand the artifact first; material expansion returns to DESIGN review (`principle-scope-fence`).
- Move backward one phase only. A structure flaw returns to STRUCTURE; a design flaw to DESIGN.
- Never enter PR while a HARD gate, Blocking, or Major finding remains. Fix loops never consult the user; Minor-and-below eligible findings become review notes.
