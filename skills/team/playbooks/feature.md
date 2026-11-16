# Feature playbook

Before this operation, read [artifact schema](../references/artifacts.md).
Resolve links from this file's directory and read each step's linked rules before it. If a read fails, stop that step and report the resolved path; never use checkout fallback or recursive loading.

Ten sequential phases on each route except `fix`, which runs eleven with ROOT CAUSE second; none are skippable.

## Phase Sequence

| Phase | Produces | Gate |
|---|---|---|
| **WORKTREE** | branch `<id>` worktree from `origin/HEAD`; author `docs/plans/<id>/` inside it | HARD: exists before QUESTION |
| **ROOT CAUSE** | `0-root-cause.md`, on `fix` only ([root-cause playbook](root-cause.md)) | HARD: the look and the tree check pass before QUESTION |
| **QUESTION** | `1-task.md` (full, human-only) and `2-questions.md` (neutral codebase context; no goal) | HARD: both on disk |
| **RESEARCH** | `5-research.md` | HARD: on disk |
| **DESIGN** | `6-design.md` and `design-review-<n>.md` each round | REVIEW: APPROVE/COMMENT advance; REQUEST CHANGES redrafts and reviews again |
| **STRUCTURE** | `7-structure.md` (vertical slices) | NONE: autonomous |
| **PLAN** | `8-plan.md` | SOFT: no approval; reviewed design is contract |
| **IMPLEMENT** | code, passing tests, per-slice commits | MECHANICAL: assertion-only failures and passing static checks before slices |
| **CODE REVIEW** | `review-<n>.md` each round; fix commits | AGGREGATE: verifier and code-review hard gates |
| **SECURITY REVIEW** | `security-review-<n>.md` each round; fix commits | AGGREGATE: security hard gate |
| **PR** | GitHub draft PR | terminal: record URL; close ledger |

WORKTREE is router-owned and has no agent; see "Why first" in `../../team-worktree/playbooks/worktree.md`.

IMPLEMENT has three sub-phases: (1) test-architect writes failing acceptance tests; (2) a mechanical gate requires assertion failures, not crashes, plus passing static checks — for a zero-behavior-change refactor it inverts to a reproduced green pre-change baseline and the test-architect dispatch is skipped with a recorded reason; (3) implementer commits green slices.

CODE REVIEW runs `skills/team-code-review/`: 4 parallel code/docs/ux/verifier reviews loop until no Blocking/Major remains.

SECURITY REVIEW runs `skills/team-security-review/`: `security-reviewer` alone runs the same loop. When its fix commits leave the review record stale, the run moves back to CODE REVIEW.

## Artifact and isolation invariants

The [artifact schema](../references/artifacts.md) owns every artifact schema. Research is blind ([independent review rules](../principles/independent-review.md)).

## Gates

- **HARD:** block until satisfied or explicitly overridden by the user (e.g. REQUEST CHANGES, gating security findings, test failures).
- **SOFT:** add eligible findings to the PR's `review-notes` comment; never ask mid-run. "Severity Tiers and the Auto-Fix Boundary" in the [finding format](../references/findings.md) alone defines gating, auto-fix, and which lower-tier findings qualify ([durable state rules](../principles/durable-state.md), [human control rules](../principles/human-control.md)).
- **ADVISORY:** non-blocking, no acknowledgment (e.g. documentation gaps, style); deterministic checks enforce rules where possible ([verified results rules](../principles/verified-results.md)).

## State and transitions

These rows add to Setup step 7 resume detection. "IMPLEMENT complete" is the rule in the "Branch state" section of the [artifact schema](../references/artifacts.md). On `fix`, the `fix:` rows apply in order, and the first match wins. The first `fix:` row's halt names the artifact directory and its `1-task.md`, which another route, standalone `/team-question`, or a QUESTION retry that failed its look wrote; the operator removes that directory's artifacts or starts `/team fix` under another topic. The [phase loop](../references/03-the-phase-loop.md) defines the look, the QUESTION look, and the resume tree check.

| Latest durable state | Next/current phase |
|---|---|
| not `fix`: worktree exists; no `1-task.md` | WORKTREE |
| `fix`: `1-task.md`, and no `0-root-cause.md` or no `route: fix` | halt before any dispatch |
| `fix`: worktree exists; no `0-root-cause.md`, `1-task.md`, or `2-questions.md` | WORKTREE, then ROOT CAUSE |
| `fix`: `0-root-cause.md` passes the look; no `2-questions.md`; no `1-task.md`, or one with `route: fix` | resume tree check, then QUESTION |
| `fix`: `0-root-cause.md` passes the look; `1-task.md` passes the QUESTION look; `2-questions.md` | RESEARCH or later, by step 7 and the rows below |
| `fix`: `2-questions.md`; no `1-task.md` | halt before any dispatch |
| `fix`: `0-root-cause.md` exists and fails the look | halt before any dispatch |
| `fix`: `0-root-cause.md` passes the look; `1-task.md` with `route: fix` fails the QUESTION look; `2-questions.md` | halt before any dispatch |
| `8-plan.md`; IMPLEMENT not complete | IMPLEMENT |
| IMPLEMENT complete; no PASS record that is current | CODE REVIEW |
| newest `review-<n>.md` PASS and current; no current PASS `security-review-<n>.md` | SECURITY REVIEW |
| newest `review-<n>.md` and newest `security-review-<n>.md` both PASS and current | PR |
| PR(s) open or commits shipped | SHIPPED |

Worktree check: `git worktree list --porcelain | grep -q <id>`; multi-repo paths come from `4-repos.md`.

## Scope and sequencing rules

- Never implement without structure; slices follow playbooks/structure.md.
- Add no feature, test, or abstraction beyond structure. Expand the artifact first; material expansion returns to DESIGN review ([human control rules](../principles/human-control.md)).
- Move backward one phase only: a structure flaw returns to STRUCTURE, a design flaw to DESIGN.
- Never enter PR while a HARD gate, Blocking, or Major finding remains.
