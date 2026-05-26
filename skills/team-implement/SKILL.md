---
name: team-implement
description: Execute the implementation phase. Includes test-first sub-step (writing failing tests, mechanical confirmation gate) and adversarial verification (7 parallel reviewers + aggregator with hard-gate retry loop). Trigger on "implement this", "execute the plan", or "/team-implement".
argument-hint: "[docs/plans/<id>/]"
---

# Team Implement — Execute the Plan

Run the IMPLEMENT phase. Three internal sub-steps:

1. **Test-first** — `test-architect` writes failing acceptance tests
2. **Slice execution** — `implementer` executes vertical slices with
   per-slice commits
3. **Code review** — 7 parallel reviewers + `review-aggregator`
   synthesis + aggregate hard-gate retry loop

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
# Three-tier artifact-directory discovery (archetype A).
# ID_RE + PHASE_FILES canonical from hooks/session-start-recover.mjs.
# PHASE_FILES recency mirrors findActiveTopic() in session-start-recover.mjs.
# NOTE: this block is duplicated across 8 skills by design (see docs/architecture.md); future: shared discover-topic.sh.
ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
PHASE_FILES="task questions research design structure plan"
PRED="plan.md"            # predecessor artifact this skill consumes
# Tier 1 — explicit: $ARGUMENTS names an existing dir → use verbatim.
if [ -n "$ARGUMENTS" ] && [ -d "$ARGUMENTS" ]; then
  echo "$ARGUMENTS"; exit 0
fi
# Tier 2 — discover: newest ID_RE dir under docs/plans/ that holds PRED.
best=""; best_mtime=-1
# Assumes cwd is the repo/worktree root (where docs/plans/ lives).
for dir in docs/plans/*/; do
  name="$(basename "$dir")"
  printf '%s' "$name" | grep -qE "$ID_RE" || continue   # ID_RE filter
  [ -f "$dir$PRED" ] || continue                        # predecessor filter
  m=-1
  for p in $PHASE_FILES; do
    f="$dir$p.md"
    [ -f "$f" ] || continue                             # skip racing/absent
    s="$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null)" || continue
    [ "${s:-0}" -gt "$m" ] && m="$s"                    # max-mtime over PHASE_FILES
  done
  [ "$m" -gt "$best_mtime" ] && { best_mtime="$m"; best="$dir"; }
done
[ -n "$best" ] && { echo "$best"; exit 0; }
# Tier 3 — none found: print nothing → fall to AskUserQuestion (prose below).
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
5. **Clear `docs/plans/<id>/reviews/`.** Before dispatching the
   reviewer fan-out, re-validate `<id>` against the canonical
   `ID_RE` regex and clear the reviews directory:
   ```sh
   # Defense in depth: validate <id> again at the destructive
   # call site (the discovery block above is upstream — never
   # rely on it alone for an `rm -rf`).
   ID_RE='^([A-Za-z][A-Za-z0-9_]*-[0-9]+|[0-9]{4}-[0-9]{2}-[0-9]{2})-[a-z0-9][a-z0-9-]*$'
   id_part="$(basename "$ARGUMENTS")"
   printf '%s' "$id_part" | grep -qE "$ID_RE" \
     || { echo "Unsafe id rejected: $id_part" >&2; exit 1; }
   rm -rf "docs/plans/$id_part/reviews"
   mkdir -p "docs/plans/$id_part/reviews"
   ```
   This step runs once per IMPLEMENT *round*, before the parallel
   fan-out — never during a single-reviewer re-dispatch. The
   aggregator and every external reviewer write their artifacts to
   this directory; clearing it guarantees no stale artifacts from a
   prior round (or a prior topic) contaminate aggregation.
6. Dispatch 7 reviewers in parallel: `code-reviewer`,
   `security-reviewer`, `technical-writer`, `ux-reviewer`, `verifier`,
   `external-reviewer-codex`, `external-reviewer-gemini`. The 5 Claude
   reviewers emit through their transcripts as today; the 2 external
   wrappers write artifacts to `docs/plans/<id>/reviews/`.
7. Dispatch `review-aggregator` after the parallel fan-out
   completes. It reads `docs/plans/<id>/reviews/` (the two external
   artifacts) and the 5 Claude transcripts (forwarded by the
   orchestrator) and writes the synthesis to
   `docs/plans/<id>/reviews/review-aggregator.md`. The orchestrator
   forwards each Claude reviewer's subagent return value verbatim in
   the aggregator dispatch prompt, prefaced with `## <reviewer-name>`
   (e.g. `## code-reviewer`, `## security-reviewer`,
   `## technical-writer`, `## ux-reviewer`, `## verifier`) so the
   aggregator can attribute findings to each reviewer when
   reconciling.
8. **Aggregate gate** — read
   `docs/plans/<id>/reviews/review-aggregator.md` and evaluate the
   three hard gates against the verdict tokens emitted by the 5 Claude
   reviewers (the aggregator preserves these verbatim). Confidence
   tags (`[single-model — extra scrutiny]`, `corroborated by N/M`) are
   display-only and MUST NOT alter the hard-gate decision:
   - `security-reviewer` FAIL on CRITICAL or HIGH findings
   - `verifier` FAIL if any check failed or no checks detected
   - `code-reviewer` FAIL on REQUEST CHANGES verdict

   `PARTIAL` verdicts (from a non-SKIP external reviewer whose CLI
   returned partial output) are treated as advisory — like `SKIP`,
   they do not gate. Only the three hard-gate verdicts above can
   trigger a fail.
9. On hard-gate failure:
   - Record a typed failure class (security, lint, typecheck, build,
     test, review)
   - Append `Review round <n+1>` to the TodoWrite ledger
   - If round count < 5: re-dispatch implementer with the typed class,
     then re-dispatch ALL 7 reviewers + the aggregator for a fresh
     review
   - If round count ≥ 5: escalate with a full unresolved-findings summary
10. **Stop once all hard gates pass clean.** Suggest `/team-pr`.

**Reviewer artifact convention:** any reviewer that writes a report
artifact (currently `external-reviewer-codex`,
`external-reviewer-gemini`, and `review-aggregator`) writes to
`docs/plans/<id>/reviews/<agent-name>.md` (kebab-case agent name).

## Quality Loop

```
test-architect → mechanical gate → implementer → 7 reviewers + aggregator → aggregate gate
                                       ↑                            ↓ fail
                                       └────── (specific fix) ──────┘
                                                                    ↓ pass
                                                              verification clean
```

Maximum 5 rounds. Each round is a complete re-review with fresh context —
reviewers do not remember previous rounds.

## Standalone Mode Tradeoffs

Standalone mode skips the Question/Research/Design/Structure/Plan
ceremony. You forfeit blind research, human design alignment, and explicit
slice breakdown. Use it when:

- The work is well-scoped and tracked in a ticket with clear acceptance
- You have already decided the approach and want test-first execution
- The change is small enough that QRSPI artifacts would be overhead

For larger features, prefer `/team` (full pipeline) for the alignment gates.

## Completion

Present all review verdicts and tell the user:
**"Next: run `/team-pr docs/plans/<id>/`"**
