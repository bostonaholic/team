---
name: team-implement
description: Execute the implementation phase. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (5 parallel reviewers with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Implement — Execute the Plan

Run the IMPLEMENT phase. Three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with
   per-slice commits
3. **Code review** — 5 parallel reviewers + aggregate hard-gate retry loop

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery block below resolves it.

The agents read:

- `$ARGUMENTS/plan.md` — file-level steps and per-slice tests
- `$ARGUMENTS/structure.md` — slice ordering and verification checkpoints
- `$ARGUMENTS/design.md` — context for what each test should assert
- `$ARGUMENTS/repos.md` — repo scope (only present when the topic spans
  more than one repository); the implementer cd's between worktrees as
  the plan steps require
- `$ARGUMENTS/task.md` — intent (for the implementer when in standalone mode)

Resolve the artifact directory by running this self-contained block (one bash
call — agent threads reset cwd between calls):

```sh
# Three-tier artifact-directory discovery (archetype A) — shared script.
# Single source: skills/qrspi-workflow/discover-topic.sh (was duplicated 8x).
# Args: <pred> <require_approved> <explicit_dir>; scans docs/plans/ in cwd.
bash "${CLAUDE_PLUGIN_ROOT}/skills/qrspi-workflow/discover-topic.sh" "plan.md" "" "$ARGUMENTS"
```

- **If the block printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery). When the path came from
  tier 2 (no explicit arg), announce the resolved directory to the user before
  proceeding, so an auto-picked topic is never silent.
- **If the block printed nothing** (tier 3 — no directory under `docs/plans/`
  holds `plan.md`), do not hard-error. Fire
  `AskUserQuestion` with a `Setup` header and labeled options:
  - **Run the producer** — run `/team-plan docs/plans/<id>/` to produce the
    missing `plan.md`.
  - **Provide a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).
  - **Describe the task** — the user types a 1–2 sentence description of what
    to implement. Derive a fresh `<id>` (date-prefixed kebab slug, the same way
    the questioner does), create `docs/plans/<id>/task.md` from that
    description, then proceed from the new directory in **standalone mode**.

**Standalone mode** — the resolved or provided directory has no `plan.md`, so
the run starts from that directory's `task.md` instead. It triggers whenever
tier 1 (explicit `$ARGUMENTS`), a user-provided path, or a freshly derived
directory (from **Describe the task**) names a `docs/plans/<id>/` that lacks
`plan.md`. The directory is always defined in this case.
If `$ARGUMENTS/plan.md` does not exist in it, run `test-architect` →
`implementer` → reviewers from `$ARGUMENTS/task.md` alone.

Coordinate progress via TodoWrite. Seed: `Test-architect → Mechanical
gate → Implementer (per slice) → Review round 1`.
See `skills/progress-tracking/SKILL.md` for the per-step tracking convention agents follow within each phase.

## Worktree Check

Before any agent dispatch, decide where to work:

1. **Read `$ARGUMENTS/repos.md` if present.** When present, you are in
   multi-repo mode. Confirm a worktree exists in **every** listed repo
   (read the `## Worktrees` section). If any are missing, tell the
   user to run `/team-worktree [docs/plans/<id>/]` (the path is
   optional — discovery resolves it) and stop.
2. Run `git rev-parse --absolute-git-dir`. If the path contains
   `/worktrees/`, you are already inside a Claude Code worktree —
   proceed in place. In multi-repo mode this should be the home repo's
   worktree; the implementer cd's into the other repos' worktrees as
   the plan steps require.
3. If you are in the main working tree, use `AskUserQuestion` to ask
   where to run the implementation. Use a single question with a
   `Worktree` header and these options:
   - **Worktree (Recommended)** — isolate this implementation in a new
     git worktree (or set of worktrees in multi-repo mode).
   - **In-place** — implement on the current branch in the main working
     tree.

   - On **Worktree** — derive `<id>` from the resolved directory, create the
     worktree(s) via `/team-worktree [docs/plans/<id>/]`, tell the user
     the home worktree path, and ask them to re-run
     `/team-implement [docs/plans/<id>/]` from that directory.
   - On **In-place** — proceed. (In-place is single-repo only — refuse
     in-place if `repos.md` is present and tell the user that
     multi-repo work requires worktrees.)

## Execution

1. **Verify** `$ARGUMENTS/plan.md` (resume mode) or bootstrap
   `$ARGUMENTS/task.md` (standalone mode).
2. Dispatch `test-architect` → produces failing tests. In standalone
   mode it derives acceptance criteria from `$ARGUMENTS/task.md` instead
   of `structure.md`.
3. **Mechanical gate** — confirm all tests fail with assertion errors
   (not crashes). On crash, fix test infrastructure before proceeding.
4. Dispatch `implementer` → executes slices with per-slice commits. In
   standalone mode it works from `$ARGUMENTS/task.md` and the failing
   tests.
5. Dispatch 5 reviewers in parallel: `code-reviewer`,
   `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`.
6. **Aggregate gate** — sort every finding into a severity tier (see
   `skills/code-review/SKILL.md` → "Severity Tiers and the Auto-Fix Boundary"):
   - **Blocking** — `security-review` CRITICAL/HIGH, any `verification` failure,
     `code-review` REQUEST CHANGES, any `issue (blocking)` comment.
   - **Major** — `suggestion (non-blocking)`, security MEDIUM, ux-reviewer
     REQUEST CHANGES.
   - **Minor and below** — `nitpick (non-blocking)`, security LOW, doc gaps,
     any COMMENT-level note.
7. While any **Blocking or Major** finding remains:
   - Record the typed failure class(es) (security, lint, typecheck, build,
     test, review, suggestion, ux).
   - Append `Review round <n+1>` to the TodoWrite ledger.
   - If round count < 5: re-dispatch implementer with the typed class(es),
     then re-dispatch ALL 5 reviewers for a fresh review.
   - If round count ≥ 5: escalate with a full unresolved-findings summary.
   - **Never** stop to ask the user which Blocking or Major items to address —
     this is the consult guard. A prompt that lists a blocking or major
     finding is a defect.
8. **Once Blocking and Major are clean:** if any **Minor-and-below** findings
   remain, present them to the user and let them decide (auto-fix,
   defer, or skip). Then:
   - **Full pipeline** (the TodoWrite ledger carries a `PR` phase item —
     `/team` seeded it): do **not** end the turn. Proceed directly to the
     PR phase (`skills/team-pr/SKILL.md`) in the same turn.
   - **Standalone**: suggest `/team-pr`.

## Quality Loop

```
test-architect → mechanical gate → implementer → 5 reviewers → aggregate gate
                                       ↑                            ↓ fail
                                       └────── (specific fix) ──────┘
                                                                    ↓ pass
                                                              verification clean
```

Maximum 5 rounds. Each round is a complete re-review with fresh context —
reviewers do not remember previous rounds.

## Standalone Mode Tradeoffs

Standalone mode skips the Question/Research/Design/Structure/Plan
ceremony. You forfeit isolated research, human design alignment, and
explicit slice breakdown. Use it when:

- The work is well-scoped and tracked in a ticket with clear acceptance
- You have already decided the approach and want test-first execution
- The change is small enough that QRSPI artifacts would be overhead

For larger features, prefer `/team` (full pipeline) for the alignment gates.

## Completion

How the phase ends depends on how it was entered:

- **Full pipeline** (the TodoWrite ledger carries a `PR` phase item —
  `/team` seeded it): present all review verdicts, then continue straight
  into the PR phase per `skills/team-pr/SKILL.md` — push the branch and
  open the draft PR in the same turn. Ending the turn with verdicts but
  no draft PR is a defect.
- **Standalone**: present all review verdicts and tell the user:
  **"Next: run `/team-pr docs/plans/<id>/`"**
