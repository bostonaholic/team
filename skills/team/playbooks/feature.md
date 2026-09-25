# Feature playbook

Before this operation, read [artifact schema](references/artifacts.md).
Before each consuming step, read its linked shared rules. Resolve links from this installed playbook directory.
If a required read fails, stop that step and report its resolved path. Never use checkout fallback or recursive loading.

Eight sequential phases; none are skippable.

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

WORKTREE is router-owned and has no agent; see "Why first" in `../team-worktree/playbooks/worktree.md`. IMPLEMENT has four sub-phases: test-architect writes failing acceptance tests; a mechanical gate requires assertion failures rather than crashes plus passing static checks, inverting to a reproduced green pre-change baseline for a zero-behavior-change refactor, whose test-architect dispatch is skipped with a recorded reason; implementer commits green slices; 5 parallel code/security/docs/ux/verifier reviews return typed failures until no Blocking/Major remains.

## Artifact and isolation invariants

[artifact schema](references/artifacts.md) owns `<id>`, inventory, `3-prd.md`, `4-repos.md`, topic, and `ticketId` schemas.

Research is blind ([independent review rules](principles/independent-review.md)).

## Gates

### HARD

Block until satisfied or explicitly overridden by the user. Examples: REQUEST CHANGES, gating security findings, test failures.

### SOFT

Add eligible findings to PR `## Review notes`; never ask mid-run. The
[finding format](../code-review/references/findings.md) "Severity Tiers and the Auto-Fix Boundary" alone defines gating, auto-fix, and which lower-tier findings qualify ([durable state rules](principles/durable-state.md)). Human owns the ends ([human control rules](principles/human-control.md)).

### ADVISORY

Non-blocking; no acknowledgment, e.g. documentation-gap analysis or style suggestions. Deterministic checks enforce rules where possible ([verified results rules](principles/verified-results.md)).

## State and transitions

These rows add to Setup step 7 resume detection:

| Latest durable state | Next/current phase |
|---|---|
| worktree exists; no `1-task.md` | WORKTREE |
| topic commits plus clean verifier | PR |
| PR(s) open or commits shipped | SHIPPED |

Worktree check: `git worktree list --porcelain | grep -q <id>`; multi-repo paths come from `4-repos.md`. Latest `review-<n>.md` records verifier status.
Confirm IMPLEMENT only when `git log <merge-base>..<id>` is non-empty; a worktree and `8-plan.md` alone remain PLAN.

## Scope and sequencing rules

- Reject horizontal database/API/UI layering; slices must be end-to-end, testable, atomic (playbooks/structure.md). Never implement without structure.
- Add no feature, test, or abstraction beyond structure. Expand the artifact first; material expansion returns to DESIGN review ([human control rules](principles/human-control.md)).
- Move backward one phase only. A structure flaw returns to STRUCTURE; a design flaw to DESIGN.
- Never enter PR while a HARD gate, Blocking, or Major finding remains.
