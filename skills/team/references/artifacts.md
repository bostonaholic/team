# Artifact Frontmatter

Schema contract for durable pipeline state under `docs/plans/<id>/`. Phase behavior lives in the [feature playbook](playbooks/feature.md); files are the phase interface ([durable state rules](principles/durable-state.md)).

## Artifact inventory

`<id>` is `<TICKET>-<kebab-topic>` (`ENG-1234-add-rate-limiting`) or `<YYYY-MM-DD>-<kebab-topic>` (`2026-05-01-add-rate-limiting`). `skills/team/scripts/plan-id.sh` owns `ID_RE` and builds every new `<id>`; `skills/team/discover-topic.sh` owns `PHASE_FILES`.

| Artifact | Path under `docs/plans/<id>/` | Created by | Required |
| --- | --- | --- | --- |
| Task | `1-task.md` | questioner | yes |
| Questions | `2-questions.md` | questioner | yes |
| PRD | `3-prd.md` | questioner | when PRD criteria apply |
| Repos | `4-repos.md` | questioner/design-author | for multiple repos |
| Research | `5-research.md` | researcher | yes |
| Design | `6-design.md` | design-author | yes |
| Structure | `7-structure.md` | structure-planner | yes |
| Plan | `8-plan.md` | planner | yes |

## Frontmatter schema

Every artifact starts with `topic: <kebab-case>`, `date: <YYYY-MM-DD>`, and `phase: task | questions | prd | repos | research | design | structure | plan`. Design adds `revision: 0`. PRD and structure are not gated; plan derives mechanically from structure.

`1-task.md` alone carries `ticketId: <id>` or `null`, and the selected route ([routing](routing.md)):

- `route: investigate | plan | prototype | feature | fix | refactor`: recorded before dispatch. Optional; absent means the legacy unprefixed full feature workflow.
- `routeStatus: complete`: present only when a limited-scope route (`investigate`, `plan`, `prototype`) has finished its deliverable, so resume never reads a finished plan as permission to implement.

Never put `ticketId`, `route`, or `routeStatus` on `2-questions.md` or any later artifact.

## Branch state

The one definition of branch progress for every reader. Resolve each term per worktree in scope.

- **Worktrees in scope.** The home worktree, resolved by the order in the [team-code-review input](../team-code-review/references/01-input.md#worktrees), plus the companions `4-repos.md` lists in multi-repo mode.
- **Default branch.** `git -C <worktree> symbolic-ref --short refs/remotes/origin/HEAD` minus the `origin/` prefix. When that fails, the first of `main` and `master` that exists: test `refs/remotes/origin/<name>` with an `origin` remote, else `refs/heads/<name>`. When no name resolves, halt and name the worktree path.
- **Base ref.** `origin/<default>` when `git -C <worktree> remote get-url origin` succeeds, else the local `<default>`. **Why:** Team never moves the local default branch, so a lagging local ref would count upstream commits as branch work.
- **Merge-base.** `git -C <worktree> merge-base <base-ref> HEAD`. On non-zero exit, halt and name the worktree path and base ref. Never substitute another ref.
- **Branch commits.** The commits in `<merge-base>..HEAD`. "Commits beyond the merge-base" means this set is not empty.
- **IMPLEMENT complete.** When `8-plan.md` exists, every `**Commit:**` subject in it equals a branch commit subject, byte for byte, listed with `git -C <worktree> log --format=%s <merge-base>..HEAD`: in the home worktree (single-repo), or in the worktree of each repo the slice's `[repo: <slug>]` steps name (multi-repo). When `8-plan.md` is absent, any worktree in scope with branch commits completes IMPLEMENT.

## Review records

- Never restore the retired `^approved:` frontmatter gate; review records alone determine passage.
- `design-review-<n>.md`: written by the orchestrator through `scripts/record-design-review.mjs` at the highest `<n>` + 1, or 1. Frontmatter `topic`, `date`, `phase: design-review`, `verdict: <APPROVE|REQUEST CHANGES|COMMENT>`; body is the verbatim report. Highest-round APPROVE or COMMENT passes. REQUEST CHANGES re-dispatches `design-author` with findings verbatim and increments numeric `revision`; missing/non-numeric means `0`, so the first rewrite writes `revision: 1`.
- `review-<n>.md` and `security-review-<n>.md`: two record families, one schema. The session that runs `team-code-review` writes `review-<n>.md`, one per completed CODE REVIEW round, with `phase: review`. The session that runs `team-security-review` writes `security-review-<n>.md`, one per completed SECURITY REVIEW round, with `phase: security-review`. Each family numbers its own records at the highest numeric `<n>` + 1, or 1. A `review-<n>.md` name starts with `review-`, so `security-review-<n>.md` and `design-review-<n>.md` files are never `review-<n>.md` records. Never overwrite a record. Ignore a non-numeric suffix such as `review-final.md` or `security-review-final.md`. Frontmatter `topic`, `date`, `phase`, `verdict: <PASS|FAIL>`. Body sections, in order:
  - `## Scope`: one `<repo-slug>: <merge-base-sha>..<head-sha>` line per repo with commits beyond its merge-base, full SHAs pinned at dispatch. `<repo-slug>` is the `4-repos.md` slug, or `home` in single-repo mode.
  - `## Tier sort`: `### Blocking`, `### Major`, and `### Minor and below`, one line per finding. An empty tier reads exactly `None.`.
  - `## Reports`: one `### <reviewer>` subsection per reviewer, report verbatim.

  `verdict` is PASS only when `### Blocking` and `### Major` both read `None.`.
- Record states for both families, one definition for every reader:
  - Malformed, when any of these holds:
    - Frontmatter does not open on line 1 and close within 60 lines.
    - `verdict` is not exactly `PASS` or `FAIL`.
    - The body lacks `## Scope`, `## Tier sort`, or `## Reports`, or `## Tier sort` lacks one of its three tier headings.
    - `## Reports` lacks a `### <reviewer>` subsection its family requires: a `review-<n>.md` requires `code-reviewer`, `technical-writer`, `ux-reviewer`, and `verifier`; a `security-review-<n>.md` requires `security-reviewer`.
    - `## Scope` holds no line in the form above.
    - `verdict` disagrees with the tier sort: PASS needs `None.` under both `### Blocking` and `### Major`; FAIL needs at least one finding line under one of them.
    - In a `review-<n>.md`, the `### verifier` report ends `### Verdict: FAIL` and `### Blocking` holds no `[verifier]` line.
  - Current: well-formed; each `## Scope` line's `<head-sha>` equals `git -C <worktree> rev-parse HEAD` for that repo; no worktree in scope has commits beyond its merge-base without a `## Scope` line; and every worktree in scope is clean outside `docs/plans/`: `git -C <worktree> status --porcelain --untracked-files=all -- . ':(exclude)docs/plans/'` prints nothing.
  - Stale: well-formed and not current.

  A malformed record counts as not passing. Reviewers and the implementer never read a record.
- `cross-model-notes.md`: orchestrator-written through the team scripts, append-only, one blockquoted `### Cross-model disposition` block per DESIGN or CODE REVIEW round. Frontmatter: copied `topic`, `date`, `phase: cross-model-review`; no `verdict`. A block starting `> **Design round <n>**` is from DESIGN; unlabeled means CODE REVIEW. Created on first use; reviewers never read it as prior state.
- `cross-model-raw.md`: orchestrator-written, append-only DESIGN capture of vendor output ([cross-model review](cross-model-review.md)). Frontmatter: copied `topic`, `date`, `phase: cross-model-raw`; no `verdict`. Live/pre-merge audit only; worktree teardown deletes it.

## Topic invariant

Every artifact in one directory has the identical `topic`: the `<id>` minus its `<TICKET>-` or `<YYYY-MM-DD>-` prefix (`ENG-9876-cache-invalidation` → `cache-invalidation`). The questioner chooses it; downstream agents copy it verbatim, never the ticket, date, or a reworded description.

## Conditional artifacts

Before writing or validating `4-repos.md` (`phase: repos`) or `3-prd.md` (`phase: prd`), read [conditional-artifacts.md](conditional-artifacts.md) for their templates and ownership rules. `4-repos.md` presence enables multi-repo mode; absence means single-repo. `3-prd.md` is conditional per `## Conditional PRD` in the [question playbook](playbooks/question.md), referenced by `1-task.md`, autonomous, and has no `approved`/`revision`.
