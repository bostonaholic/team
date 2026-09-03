---
name: qrspi-workflow
description: Apply when coordinating or validating Team's Worktree-Question-Research-Design-Structure-Plan-Implement-PR pipeline. Defines phase order, gates, artifact transitions, research isolation, and recovery.
user-invocable: false
---

# QRSPI Workflow

Apply `skills/principle-blind-the-investigator/SKILL.md`,
`skills/principle-files-are-the-contract/SKILL.md`,
`skills/principle-human-owns-the-ends/SKILL.md`,
`skills/principle-mechanical-gates/SKILL.md`,
`skills/principle-scope-fence/SKILL.md`, and
`skills/principle-single-source-of-truth/SKILL.md`.

Run every phase in order:

```text
WORKTREE -> QUESTION -> RESEARCH -> DESIGN -> STRUCTURE -> PLAN -> IMPLEMENT -> PR
```

| Phase | Completion signal | Gate |
| --- | --- | --- |
| WORKTREE | `1-task.md` persisted in the resolved checkout | branch/worktree prepared |
| QUESTION | `2-questions.md` | both task and neutral questions exist |
| RESEARCH | `5-research.md` | artifact exists |
| DESIGN | `6-design.md` plus latest passing `design-review-<n>.md` | APPROVE/COMMENT pass; REQUEST CHANGES loops |
| STRUCTURE | `7-structure.md` | none |
| PLAN | `8-plan.md` | none |
| IMPLEMENT | valid `9-implementation.md` for current HEAD(s) | no Blocking or Major findings |
| PR | current-head `10-pr.md` | every draft PR exists |

`skills/artifact-frontmatter/SKILL.md` owns every schema and
`skills/artifact-frontmatter/scripts/resolve-topic.mjs` owns artifact
resolution. The executable phase resolver is
`skills/team/scripts/phase-state.mjs`.
`3-prd.md` remains an optional QUESTION output and never controls phase state.

## Coordination

`team` is the only coordinator. It rebuilds TodoWrite from artifacts, invokes
one hidden `team-*` module per phase, verifies that module's completion signal,
then advances. Phase modules receive one explicit artifact directory, execute
only their phase, and return. They never select the newest topic or invoke the
next phase.

`/team resume <id>` resolves only `<id>`. `/team resume <id> --only <phase>`
validates predecessors, runs at most that phase, and stops. Existing valid
output is an idempotent no-op. A missing predecessor is an error, not permission
to run its producer.

## Research isolation

Pass `file-finder` and `researcher` only `2-questions.md` and optional `4-repos.md`.
Never pass the request, `1-task.md`, or goal framing. Both agents surface missing
context as an open question. Intent leakage is a pipeline defect.

## Gates

- DESIGN uses a fresh read-only adversarial reviewer. Record every round.
  Missing or malformed verdicts fail closed.
- IMPLEMENT first confirms new acceptance tests fail by assertion while static
  checks pass. The implementer then commits vertical slices.
- Run code, security, documentation, UX, and mechanical reviewers in parallel.
  Use `review-severity-tiers`; automatically fix and re-review while Blocking
  or Major findings remain. Do not consult the user mid-loop.
- Record Minor-and-below findings in `9-implementation.md` for the PR body.
- A changed HEAD invalidates `9-implementation.md`; re-run IMPLEMENT before PR.

## Multi-repo

`4-repos.md` enables multi-repo mode. WORKTREE creates the home worktree first.
Before STRUCTURE on both fresh and resumed runs, invoke team-worktree again to
add missing secondary worktrees and record all paths. Research covers every
listed repo; slices and plan steps use `[repo: <slug>]`; IMPLEMENT verifies
every recorded HEAD; PR opens and cross-links one draft per repo with commits.

Before creating a secondary worktree, require its real path to be a direct
child of the home repo's parent. Reuse an existing non-default-branch worktree.
Never implement on a default branch. A worktree-creation failure may fall back
in place only after reporting it; multi-repo containment failures are refused.

## Recovery rules

- Artifacts, not conversation or TodoWrite, decide completion.
- Resume at the first incomplete phase. DESIGN with a draft but no passing
  review resumes at review. IMPLEMENT with no valid record resumes at review
  when slice commits already exist.
- Never overwrite completed artifacts. Never advance past a failed gate.
- Supporting screenshots and cross-model records never count as phase state.
- Unexpected failure reports the exact ID, artifact directory, phase, and
  `/team resume <id>` command.
