---
name: team-fix
description: |
  Reproduce a bug, commit its failing test and minimal fix, verify, push, and
  open a draft PR. Trigger only on "run the
  bug-fix pipeline", "team-fix this bug", or "/team-fix" because this mutates
  git, GitHub, and tracker state.
effort: high
argument-hint: "<ticket id, issue URL, or bug description>"
---

# Team Fix

Run WORKTREE → REPRODUCE → RED → GREEN → VERIFY → SHIP without the QRSPI
Question/Research/Design/Structure/Plan phases. A plain fix request does not
authorize this pipeline.

## Input and setup

1. Resolve `$ARGUMENTS` as a ticket ID, quoted issue URL via
   `gh issue view`, or bug description. For empty input, inspect recent git,
   `README`, and `CLAUDE.md`; use `AskUserQuestion` only for the remaining gap.
2. Capture optional `ticketId`; derive `<id>` as ticket- or date-prefixed kebab
   text.
3. If a ticket resolved, call the Skill tool with `tracking-tickets` and move
   it In progress before other mutations. Report but do not block on failure.
4. Call the Skill tool with `principle-progress-tracking` and seed:
   `Worktree → Reproduce → Red (failing test) → Green (minimal fix) → Verify → Ship`.

Use `/team` instead when the root cause is unknown enough to require broad
research, the correction adds behavior or APIs, multiple subsystems need a
design, or the user requests alignment first.

## Worktree gate

Run `../team-worktree/scripts/inspect-repo.mjs --repo <checkout>`. It resolves
the default branch from `origin/HEAD`, then existing `main`/`master`.
Never commit this fix when `onDefaultBranch` is true.

- Current non-default branch with no PR, or a PR for this bug: announce
  `Continuing on branch <branch>` and reuse it, including a linked worktree.
- Current branch has an unrelated PR, or is default: call the Skill tool with
  `team-worktree` and `worktree-isolation`; create
  `.claude/worktrees/<id>` from `origin/HEAD`.
- Existing `<id>` worktree: revalidate and reuse it.
- Worktree creation failure: report it, run `git switch -c <id>` in place, and
  re-run the branch check. If HEAD remains default, stop before writing.

Inside the selected checkout, create `docs/plans/<id>/1-task.md` with standard
`topic`, `date`, `phase: task`, and `ticketId` frontmatter. The topic is the ID
without its ticket/date prefix; `ticketId` occurs only here.

## Fix

Call the Skill tool with `test-driven-bug-fix` and follow it.

1. Reproduce deterministically. If reproduction fails, report
   `Bug could not be reproduced with the given description.` and stop.
2. When causality is non-obvious, call the Skill tool with
   `systematic-debugging`. When the suspicious code looks deliberate, call the
   Skill tool with `why` before changing it. Preserve discovered constraints.
3. Write the smallest test that reproduces the defect. Mechanical Red gate:
   it must fail by assertion, not crash, while available typecheck, lint,
   format, and build checks pass. Call the Skill tool with
   `running-quality-checks`; fix test infrastructure before GREEN.
4. Create a signed `test:` commit containing the failing test.
5. Correct the earliest changeable cause with the smallest change. Avoid
   adjacent refactors. Run the focused test, affected suite, and detected
   quality checks.
6. Create a signed `fix:` commit. Verify both signatures and a clean expected
   diff.

If the work expands into new APIs, broad edits, or architecture changes, stop,
report the scope, and recommend `/team`.

## Ship

Re-run `../team-worktree/scripts/inspect-repo.mjs --repo <checkout>`. If
`onDefaultBranch` is true, push nothing and report the local commits.
Otherwise open a draft automatically — do not stop to ask:

```sh
git push -u origin <branch>
gh pr create --draft --body-file <body-file>
```

Pass the body through a file, never interpolation. If `ticketId` exists, call
`tracking-tickets` for the closing link; keep it In progress while draft and
move it In review only when ready. Never close it manually.

## Completion

Report reproduction, test/fix commit SHAs and signatures, verification, draft
PR URL, tracker result, artifact directory, and all fallbacks/skips. Leave the
worktree for review.
