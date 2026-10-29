Before each `design-author` dispatch or retry, read [host dispatch](references/15-host-dispatch.md).

Before review dispatch, supply the installed plugin root, the resolved `skills/team/references/design-reviewer.md` path, the absolute installed `skills/team/` directory as the base of that brief's links, and the resolved paths of the manuals its `## Review brief` links, all in `skills/team/references/`: `code-reviewer.md`, `code-standards.md`, `design-template.md`, `decisions.md`, `findings.md`, `writing.md`, and `cross-model-review.md` when the prompt carries `## External review input`. Require reads before work.
If a required resource is missing, stop and report its resolved path; never use checkout fallback or recursive loading.

Before this operation, read [artifact schema](references/artifacts.md).
Resolve these links from the installed `SKILL.md` directory.

### Design Review Gate (design)

When the `design-author` returns a draft:

1. Make sure `docs/plans/<id>/6-design.md` exists. Run
   `<team-skill-dir>/scripts/design-review-status.sh <artifact-dir>`. Exit 0:
   the design already passed; skip review and advance to STRUCTURE. Exit 1:
   run this round. Exit 2: halt with its stderr.
2. **Run the external cross-model pass** every round, before the dispatch,
   exactly per `## Design-review pass` in [cross-model review](cross-model-review.md),
   which owns detection, couriers, skip lines, fencing, and the
   `cross-model-raw.md` transcript; never duplicate it here. Its one gate is
   the `TEAM_DISABLE_CROSS_MODEL` kill-switch. Append the resulting
   `## External review input` section to the review brief. Any skip continues
   with the reviewer alone; the pass never blocks the gate.
3. **Dispatch the adversarial review.** Call the `Agent` tool with
   `subagent_type: Explore` and `model: opus` (never a cheaper default). Pass the
   `## Review brief` from the [design reviewer brief](references/design-reviewer.md)
   as the prompt, with the artifact directory substituted and the paths from
   the top of this file attached, in a
   [fresh context window](references/step-delegation.md#fresh-context) each round.
   `Explore` holds no Write/Edit tools, so the reviewer cannot change
   `6-design.md` or forge a verdict. If the environment lacks `Explore`, treat
   it as a reviewer crash (step 8); never substitute a full-tool agent.
4. **Write the verdict artifact.** With the Write tool, save the reviewer's
   complete report verbatim to a scratch file outside `docs/plans/`, then run
   `<team-skill-dir>/scripts/record-design-review.mjs --dir <artifact-dir>
   --report <file>`. Exit 0: its JSON line names `path`, `round` (`<n>`),
   `verdict`, `passed`, and `crossModelNotes`. Exit 3: no verdict token; go to
   step 8. Exit 1: fix the named missing input and rerun.
5. Step 4 already appended the report's cross-model disposition to
   `cross-model-notes.md`. Never append it again by hand.
6. On **APPROVE or COMMENT** (`passed: true`), advance to STRUCTURE in the
   same turn.
7. On **REQUEST CHANGES**, re-dispatch `design-author` with the reviewer's
   findings verbatim; the new draft sets `revision: <n+1>`, then a fresh
   review round runs. No round cap: the loop ends only on a passing verdict.
8. On an **unparseable verdict or a reviewer crash**, re-dispatch the review
   once with the error. On second failure, halt loudly. Never advance on a
   missing verdict; fail closed
   ([verified results rules](principles/verified-results.md)). The halt
   message names the absolute worktree-rooted `docs/plans/<id>/` path.
   Recovery after an operator stop, context exhaustion, or this halt: edit
   `6-design.md` by hand and re-invoke `/team-design` bare; it resumes at its
   review step without re-drafting, then stops naming `/team-structure` next.
   `/team` with the same description or ticket also resumes (Setup steps 4
   through 7). A recovered run may instead continue one phase command at a
   time: `/team-implement`, `/team-code-review`, `/team-security-review`,
   `/team-pr`.
