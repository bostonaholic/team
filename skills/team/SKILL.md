---
name: team
description: |
  Run the full QRSPI pipeline. Trigger on "hey team", "build a feature",
  "implement end to end", "autonomous implementation", or "/team". This
  creates branches and commits, pushes, opens draft PRs, and updates a tracker;
  require one of those stated intents.
effort: medium
argument-hint: "<ticket id, issue URL, or feature description>"
---

# Team

Run Worktree → Question → Research → Design → Structure → Plan → Implement → PR
in one turn. The main session coordinates; artifacts are durable state and each
phase skill owns its procedure.

## Start or resume

1. Require `$ARGUMENTS`. Resolve a quoted issue URL with `gh issue view`; use a
   ticket integration when available; otherwise treat it as description text.
2. Capture optional `ticketId` and derive `<id>` as
   `<TICKET>-<kebab-topic>` or `<YYYY-MM-DD>-<kebab-topic>`.
3. If a ticket resolved, call the Skill tool with `tracking-tickets` and move it
   In progress before other mutations. Tracker failure never blocks; report it.
4. Call the Skill tool with `principle-progress-tracking`. Seed exactly:
   `Worktree → Question → Research → Design → Structure → Plan → Implement → PR`.
5. Check the primary checkout and any matching `<id>` worktree for the exact
   `docs/plans/<id>/` directory. Use the sole artifact-bearing location. If both
   contain it, stop and report ambiguous durable state. If neither does, prefer
   the matching worktree, then the primary checkout.
6. Before rebuilding progress, including on resume, call the Skill tool with
   `team-worktree` in home-only mode and that candidate. Its idempotent result
   is the current WORKTREE evidence and supplies the canonical absolute artifact
   directory. Home-only mode ignores `4-repos.md`.
7. Rebuild progress from files. Do not overwrite completed artifacts. DESIGN is
   complete only when the highest `design-review-<n>.md` verdict is `APPROVE` or
   `COMMENT`. A draft without a passing review resumes in DESIGN. Existing
   implementation commits resume at IMPLEMENT review; an existing branch PR
   completes PR only after its current body and tracker link are verified.
8. When that reconstruction finds both a passing design review and `4-repos.md`,
   call the Skill tool with `team-worktree` again for all declared repos before
   choosing a later phase. Its result supplies every repo's current fallback
   evidence.

## Phase table

| Phase | Skill | Required input | Completion |
|---|---|---|---|
| WORKTREE | `team-worktree` | resolved description and `<id>` | home worktree or reported in-place fallback |
| QUESTION | `team-question` | full request | `1-task.md`, `2-questions.md` |
| RESEARCH | `team-research` | `2-questions.md` only | `5-research.md` |
| DESIGN | `team-design` | task, questions, research | passing design review |
| STRUCTURE | `team-structure` | reviewed design | `7-structure.md` |
| PLAN | `team-plan` | structure | `8-plan.md` |
| IMPLEMENT | `team-implement` | plan and worktrees | zero Blocking/Major findings |
| PR | `team-pr` | verified branch | draft PR URL per changed repo |

For the active row, call the Skill tool with its listed skill, pass the explicit
absolute artifact directory, verify completion, update TodoWrite, and continue
immediately. Never end between phases.

### WORKTREE

Before mutation, run `node "<skill-dir>/scripts/preflight.mjs"` and report
its structured SSH-agent, GitHub-auth, signing-config, and bounded signed-commit
probe results. Continue despite a cold credential; this preflight never blocks
the run. A later matching signing, push, or GitHub failure cites this result.

Call `team-worktree` before QUESTION. Reuse a non-default linked worktree. Stop
on a default-branch linked worktree. If creation fails because the environment
cannot support worktrees, report it and use the home checkout for the whole
run. Create `docs/plans/<id>/` inside the selected checkout and pass its
absolute path to every later skill.

### Design Review Gate (design)

`team-design` owns the adversarial loop and its durable verdict records. Never
advance without the passing latest verdict.

### Structure (no gate — autonomous)

`team-structure` writes the artifact and advances without approval.

### Multi-repo topics

After DESIGN, if `4-repos.md` exists, enter multi-repo mode. Call
`team-worktree` again to create/reuse secondary worktrees and record one
`## Worktrees` section. Research spans the listed siblings; structure and plan
use repo annotations; implementation changes directories per step; PR opens
one cross-linked draft per repo with commits. Report any containment rejection
or in-place fallback. Absence of `4-repos.md` means single-repo mode.

### IMPLEMENT and PR

`team-implement` owns test-first execution and the five-reviewer aggregate
gate. Blocking and Major findings loop automatically; Minor-and-below findings
go to PR review notes. On pass it calls `team-pr` in the same turn. `team-pr`
updates `## [Unreleased]`, preserves signed slice commits, pushes, opens drafts,
links the ticket, and leaves worktrees for review. Never version or merge here.

## Invariants

- There are **no mid-run approval prompts**. Agents resolve open choices and record
  assumptions. Only setup fallbacks owned by standalone phase commands ask.
- The questioner alone receives the original description. `file-finder` and
  `researcher` receive only `2-questions.md` and optional `4-repos.md`. A leak is a
  terminal defect.
- Self-writing agent output is verified on disk. Return-only research output
  must arrive in full; redispatch a truncated result.
- Artifact schemas come from `artifact-frontmatter`; phase order and gates come
  from `qrspi-workflow`; agent inventory comes from `team/registry.json`.
- On unexpected failure, report phase, artifact directory, durable evidence,
  and the matching `/team-* docs/plans/<id>/` recovery command.

## Completion

Complete only after reporting draft PR URL(s), head SHA(s), tracker result,
review verdicts, fallbacks/skips, and the artifact directory.
