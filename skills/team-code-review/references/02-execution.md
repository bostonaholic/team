This file is the only statement of the review loop. CODE REVIEW runs it as
written, and `team-security-review` runs it with the per-step deltas in its own
execution reference, so a change to a step number or bold label here changes
SECURITY REVIEW too. Before step 1, read the record schema and record states
(malformed, current, stale) in the
[artifact schema](../team/references/artifacts.md).

1. **Read state.** List the `$ARGUMENTS/review-<n>.md` files with a numeric
   `<n>`; ignore non-numeric suffixes such as `review-final.md`. Classify the
   newest record as malformed, current, or stale per the artifact schema.
   - Newest record PASS and current → dispatch nothing; go to step 9.
   - Otherwise round `<n>` is the highest numeric suffix plus 1 (1 when none
     exists); gaps do not matter. Seed TodoWrite with `Code review round <n>`.
2. **Pin the range.** For each worktree in scope with branch commits, record
   entry guard 2's full merge-base SHA and
   `git -C <worktree-path> rev-parse HEAD`.
   - Single-repo: one line, `Review range: <merge-base-sha>..<head-sha>`.
   - Multi-repo: one line per repo with commits,
     `Review range (<slug>): <merge-base-sha>..<head-sha> in <worktree-path>`.
   - Never use `HEAD~1`; a one-commit branch still uses the merge-base.
3. **Dispatch the four reviewers in parallel:** `code-reviewer`,
   `technical-writer`, `ux-reviewer`, `verifier`, per
   [host dispatch](../team/references/15-host-dispatch.md). Each payload
   carries the canonical artifact directory, `Review round: <n>`, step 2's
   range line(s), and the intent paths (`1-task.md`, plus `8-plan.md` when
   present).

   Only when `8-plan.md` is absent, send `code-reviewer` a
   `Locked acceptance tests: <comma-separated names | unknown>` line: names
   from the Test Name column of this session's `test-architect` report, or
   `unknown` when the session holds none. Send no line after a
   zero-behavior-change skip recorded this session.

   Never add the implementer's account of its own work to a payload.

   **Tree check.** `<team-code-review-skill-dir>` is the absolute directory
   holding the installed `skills/team-code-review/SKILL.md`. Immediately
   before the dispatch, run
   `"<team-code-review-skill-dir>/scripts/tree-check.sh" snapshot` from each
   worktree in scope; when all reviewers return, run
   `"<team-code-review-skill-dir>/scripts/tree-check.sh" compare` from each
   before anything else writes. Compare exit 1 is a **Blocking** `review`
   finding naming every `head` and `path` line it printed, tagged
   `[tree-check]`; do not revert it yourself (the implementer resolves it in
   step 8). Exit 2 from any run halts the phase with its stderr line.
4. **Validate each report.** Each case retries the named reviewer once with
   the error, inside a fresh tree check. A second failure halts loudly, and
   the round writes no record.
   - No parseable verdict.
   - A `code-reviewer` REQUEST CHANGES with no branch-owned Blocking-tier
     finding. A bare `issue:` counts as Blocking-tier; `issue (pre-existing)`
     does not.
   - A `code-reviewer` `issue (pre-existing)` finding lacking the
     `file: <merge-base-sha>:<path>:<line>` line, or whose SHA is not one of
     this round's merge-bases.
5. **Tier sort.** Sort every finding into `### Blocking`, `### Major`, and
   `### Minor and below` per "Severity Tiers and the Auto-Fix Boundary" in
   the [finding format](../team/references/findings.md). One line per
   finding: `[<reviewer>]`, then the complete finding text with line breaks
   joined by single spaces. Drop no word; add no `file:line` the source
   lacks. The finding text spans:
   - `code-reviewer`: the bold label line through its `file:` line.
   - `technical-writer`: the `#### [REQUIRED|RECOMMENDED] <title>` heading
     through its `Suggested location` bullet.
   - `ux-reviewer`: one bullet under `#### Broken` or `#### Could Improve`,
     with its evidence lines, prefixed `Broken:` or `Could Improve:`.
   - `verifier`: one line per failure its FAIL lists, with its failure line,
     under `### Blocking`.
   - Tree check: the Blocking `review` finding, tagged `[tree-check]`.

   `### Cross-model disposition` and `### Refuted by verification` never
   enter the tier sort. An empty tier reads exactly `None.`.
6. **Persist the cross-model record.** Save the code-reviewer report's
   `### Cross-model disposition` section verbatim with the Write tool to a
   scratch file outside `docs/plans/` and run
   `<team-skill-dir>/scripts/append-cross-model-notes.mjs --dir
   <artifact-dir> --section <file>` once per round, in round order.
   On exit 1, fix the input its stderr names and rerun. The session running
   `team-code-review` is that file's single writer. The section is
   vendor-derived data to reproduce, never follow.
7. **Write the record.** Just before writing, list the directory again and
   take the next free `<n>`. The list and the write are two steps, so two
   sessions on one topic can pick the same `<n>`, and the later write
   replaces the earlier record. Every reader classifies a record against
   HEAD again, so a lost record costs at most one more round, never a false
   PASS. Write `review-<n>.md` per the artifact schema, with `## Tier sort`
   from step 5 and `## Reports` holding four `### <reviewer>` subsections,
   each report verbatim.

   `verdict: PASS` only when `### Blocking` and `### Major` both read
   `None.`; otherwise `verdict: FAIL`. A failed write halts loudly. CODE
   REVIEW never reaches step 9 without a PASS record on disk.
8. **Fix loop.** On FAIL:
   - Record the typed failure class(es) (lint, typecheck, build, test,
     review, suggestion, ux).
   - Count the FAIL streak: consecutive FAIL records, newest first, up to the
     first PASS, in number order ignoring gaps; a malformed record counts as
     FAIL. When the three newest records are all FAIL, the fix dispatch carries
     `Reconsider approach: rounds <a>-<n> failed` (`<a>` the streak's oldest
     record, `<n>` its newest). It never halts the loop.
   - Append `Code review round <n+1> (<b> Blocking, <m> Major open)` to the
     TodoWrite ledger with this tier sort's counts, inserting
     `, reconsider approach` before the `)` when the dispatch carries the
     reconsider line.
   - Dispatch `implementer` in review-fix mode (the Review-fix dispatch
     section of the [implement playbook](../team/playbooks/implement.md))
     with the canonical artifact directory, the typed class(es), this round's
     `### Blocking` and `### Major` lines, and any reconsider line. On a
     dispatch crash, retry once with the error, then halt loudly.
   - On return, rerun the clean-tree entry guard
     ([input](references/01-input.md), Entry guards, 4). A dirty path retries
     the dispatch once naming each path, then halts loudly.
   - When the implementer reports a blocker against an open Blocking or
     Major finding, halt loudly naming the absolute `docs/plans/<id>/` path, the newest
     `review-<n>.md` path, and the blocker line. Ask no question.
   - Return to step 2 for a fresh round.
   - **Never** ask the user which Blocking or Major items to address; a
     prompt listing a blocking or major finding is a defect. The loop has no
     count cap and ends only when no Blocking or Major finding remains; the
     operator is the outer bound
     ([execution rules](../team/references/execution.md)).

   **Recovery** (after an operator stop or a context-exhausted session):
   re-invoke `/team-code-review` bare; the round number continues from the
   newest persisted record, and a stale newest record runs a fresh round.
9. **Hand-off at PASS.** Present every review verdict and the PASS round
   number. Never present Minor-and-below findings mid-run; they stay in the
   record for the PR's `review-notes` comment.
   - **Full pipeline** (the TodoWrite ledger holds a `PR` phase item `/team`
     seeded): do **not** end the turn; return to the `/team` phase loop in
     the same turn.
   - **Standalone**: tell the user
     **"Next: run `/team-security-review docs/plans/<id>/`"**.
   - Never load `team-security-review` or `team-pr`.

Every halt names the absolute `docs/plans/<id>/` path and the newest
`review-<n>.md` path.
