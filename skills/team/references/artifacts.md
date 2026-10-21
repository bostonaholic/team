# Artifact Frontmatter

This is the schema contract for durable pipeline state under `docs/plans/<id>/`. Phase behavior lives in the [feature playbook](playbooks/feature.md); files are the phase interface ([durable state rules](principles/durable-state.md)).

## Artifact inventory

`<id>` is `<TICKET>-<kebab-topic>` (for example `ENG-1234-add-rate-limiting`) or `<YYYY-MM-DD>-<kebab-topic>` (for example `2026-05-01-add-rate-limiting`). `skills/team/scripts/plan-id.sh` owns the executable `ID_RE` and builds every new `<id>`; `skills/team/discover-topic.sh` owns `PHASE_FILES` ([durable state rules](principles/durable-state.md)).

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

`1-task.md` also carries the selected route when one was chosen ([routing](routing.md)):

- `route: investigate | plan | prototype | feature | fix | refactor` — the
  leading-argument route, recorded before dispatch. Optional; absent means the
  legacy unprefixed full feature workflow.
- `routeStatus: complete` — present only when a limited-scope route
  (`investigate`, `plan`, `prototype`) has finished its deliverable. Resume
  detection reads it so a finished plan is not mistaken for permission to
  implement.

`route` and `routeStatus` are task state, never neutral research input: neither
appears on `2-questions.md`. Limited-scope routes write their deliverable under
the home `docs/plans/<id>/` (`5-research.md` for investigate, `8-plan.md` for
plan, `prototype-report.md` for prototype); they create no production worktree.

## Branch state

This section is the one definition of branch progress. Its readers are Setup resume detection, the phase loop's REVIEW predecessor check, the feature playbook's state table, the `review-<n>.md` record states, and the `team-review` entry guards and review range. Resolve each term below per worktree in scope.

- **Worktrees in scope.** The home worktree, resolved by the order in the [team-review input](../team-review/references/01-input.md#worktrees), plus the companions that `4-repos.md` lists in multi-repo mode.
- **Default branch.** Run `git -C <worktree> symbolic-ref --short refs/remotes/origin/HEAD` and drop the `origin/` prefix. When that fails, use the first of `main` and `master` that exists. With an `origin` remote, test `refs/remotes/origin/<name>`. Without one, test `refs/heads/<name>`. When no name resolves, halt and name the worktree path.
- **Base ref.** When `git -C <worktree> remote get-url origin` succeeds, the base ref is `origin/<default>`. Otherwise, it is the local `<default>`. Team cuts each worktree from `origin/HEAD` and never moves the local default branch, so a lagging local ref would count upstream commits as branch work.
- **Merge-base.** Run `git -C <worktree> merge-base <base-ref> HEAD`. When it exits non-zero, halt and name the worktree path and the base ref. Never substitute another ref.
- **Branch commits.** The commits in `<merge-base>..HEAD`. "Commits beyond the merge-base" means this set is not empty.
- **IMPLEMENT complete.** When `8-plan.md` exists, every `**Commit:**` subject in it equals the subject of a branch commit in a worktree in scope. List the subjects with `git -C <worktree> log --format=%s <merge-base>..HEAD`. When `8-plan.md` is absent, any worktree in scope with branch commits completes IMPLEMENT. A run interrupted before its last slice commit therefore stays at IMPLEMENT.

## Review records

- Never restore the retired `^approved:` frontmatter gate; review records alone determine passage.
- `design-review-<n>.md`: orchestrator-written at the highest existing `<n>` + 1, or 1. Frontmatter is `topic`, `date`, `phase: design-review`, and `verdict: <APPROVE|REQUEST CHANGES|COMMENT>`; body is the verbatim report. Highest-round APPROVE or COMMENT passes. REQUEST CHANGES re-dispatches `design-author` with findings verbatim and increments numeric `revision`; missing/non-numeric means `0`, so the first rewrite writes `revision: 1`.
- `review-<n>.md`: written by the session that runs `team-review`, one per completed REVIEW round, at the highest numeric `<n>` + 1, or 1. Never overwrite a record. Ignore a file with a non-numeric suffix, such as `review-final.md`. Frontmatter is `topic`, `date`, `phase: review`, and `verdict: <PASS|FAIL>`. The body holds three sections, in this order:
  - `## Scope`: one `<repo-slug>: <merge-base-sha>..<head-sha>` line per repo with commits beyond its merge-base, in full SHAs pinned at dispatch. `<repo-slug>` is the `4-repos.md` slug, or `home` in single-repo mode.
  - `## Tier sort`: `### Blocking`, `### Major`, and `### Minor and below`, one line per finding. An empty tier reads exactly `None.`.
  - `## Reports`: one `### <reviewer>` subsection per reviewer, with the report verbatim.

  `verdict` is PASS only when `### Blocking` and `### Major` both read `None.`.
- `review-<n>.md` record states, one definition for every reader:
  - Malformed, when any of these holds:
    - Its frontmatter does not open on line 1 and close within 60 lines.
    - Its `verdict` is not exactly `PASS` or `FAIL`.
    - Its body lacks `## Scope`, `## Tier sort`, or `## Reports`, or `## Tier sort` lacks one of its three tier headings.
    - `## Reports` lacks one of the five `### <reviewer>` subsections: `code-reviewer`, `security-reviewer`, `technical-writer`, `ux-reviewer`, and `verifier`.
    - `## Scope` holds no line in the form above.
    - Its `verdict` disagrees with its tier sort. PASS needs `None.` under both `### Blocking` and `### Major`. FAIL needs at least one finding line under one of them.
    - The `### verifier` report ends `### Verdict: FAIL`, and `### Blocking` holds no `[verifier]` line.
  - Current: well-formed, and each `## Scope` line's `<head-sha>` equals `git -C <worktree> rev-parse HEAD` for that repo. Also, no worktree in scope has commits beyond its merge-base without a `## Scope` line, and every worktree in scope is clean outside `docs/plans/`: `git -C <worktree> status --porcelain --untracked-files=all -- . ':(exclude)docs/plans/'` prints nothing.
  - Stale: well-formed and not current.

  A malformed record counts as not passing. The readers are `team-review`, Setup resume detection, the phase loop's PR predecessor check, and `/team-pr`. Reviewers and the implementer never read a record.
- `cross-model-notes.md`: orchestrator-written, append-only, one already-blockquoted `### Cross-model disposition` block per DESIGN or REVIEW round. Frontmatter: copied `topic`, `date`, `phase: cross-model-review`; no `verdict`. A block starting `> **Design round <n>**` is from DESIGN; unlabeled means REVIEW. Create only on first use; reviewers never read it as prior state.
- `cross-model-raw.md`: orchestrator-written, append-only DESIGN capture with one result line plus fenced raw output per vendor call; zero calls append nothing. Frontmatter: copied `topic`, `date`, `phase: cross-model-raw`; no `verdict`. It supports live/pre-merge audit only because `docs/plans/` is gitignored and the worktree teardown deletes the topic directory.

## Topic and ticket invariants

Every artifact in one directory has the identical `topic`: the `<id>` minus its `<TICKET>-` or `<YYYY-MM-DD>-` prefix (`ENG-9876-cache-invalidation` → `cache-invalidation`; `2026-05-01-add-rate-limiting` → `add-rate-limiting`). The questioner chooses it; downstream agents copy it verbatim. Never use the ticket, date, or reworded description.

`ticketId` appears only on `1-task.md`, the canonical intent record; never on `2-questions.md`, `5-research.md`, `6-design.md`, `7-structure.md`, or `8-plan.md`.

## Conditional artifacts

Before writing or validating `4-repos.md` (`phase: repos`) or `3-prd.md` (`phase: prd`), read [conditional-artifacts.md](conditional-artifacts.md) for their exact templates and ownership rules. `4-repos.md` presence enables multi-repo mode; absence means single-repo. `3-prd.md` is conditional per the `## Conditional PRD` section of the [question playbook](playbooks/question.md), referenced by `1-task.md`, autonomous, and has no `approved`/`revision`.
