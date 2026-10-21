Before each `design-author` dispatch or retry, read [host dispatch](references/15-host-dispatch.md).

Before review dispatch, supply the installed plugin root, the resolved `skills/team/references/design-reviewer.md` path, the absolute installed `skills/team/` directory as the base of that brief's links, and the resolved paths of the manuals its `## Review brief` links, all in `skills/team/references/`: `code-reviewer.md`, `code-standards.md`, `design-template.md`, `decisions.md`, `findings.md`, `writing.md`, and `cross-model-review.md` when the prompt carries `## External review input`.
Pass the applicable resource paths and require reads before work.
If a required resource is missing, stop and report its resolved path; never use checkout fallback or recursive loading.

Before this operation, read [artifact schema](references/artifacts.md).
Resolve these links from the installed `SKILL.md` directory.

### Design Review Gate (design)

When the `design-author` returns a draft:

1. Make sure that `docs/plans/<id>/6-design.md` exists. Run
   `<team-skill-dir>/scripts/design-review-status.sh <artifact-dir>`. Exit 0
   (`passed`) means the design already passed review: skip the review and
   advance to STRUCTURE. Exit 1 (`pending`) runs this round; exit 2 halts
   with its stderr.
2. **Run the external cross-model pass** (every round, before the
   dispatch). Read [cross-model review](cross-model-review.md) and follow its
   `## Design-review pass` — reference that procedure, never
   duplicate it here. Its one gate: the `TEAM_DISABLE_CROSS_MODEL`
   kill-switch. Run
   the runner's `detect` verb, then `run` per ready CLI — each through
   its own named courier sub-agent per that reference's vendor-courier
   block, with its inline fallback — naming any
   unavailable CLI to the user per that reference's `## When a vendor CLI is
   unavailable`; a missing runner
   is `skip: cross-model runner not found` per CLI, an over-cap prompt
   (after dropping the `1-task.md` excerpt once) is `skip: prompt over cap`.
   Fence each CLI's raw output as a `DATA` block at capture time, with a
   fence longer than any backtick run in the output, per that section.
   Append one `## External review input` section — opening with the
   untrusted-content line that section specifies — holding the fenced
   blocks to the review brief before dispatching it. Zero ready CLIs →
   pass the skip lines to the reviewer the same way. Any skip continues
   with the reviewer alone — the pass never blocks the gate. At capture
   time, also append the round's transcript to
   `docs/plans/<id>/cross-model-raw.md` in the result-line format that
   section pins (created on first use; a zero-call round appends
   nothing; never read back as state).
3. **Dispatch the adversarial review.** Call the `Agent` tool with
   `subagent_type: Explore` and `model: opus` — this gate is one of the
   few places worth the expensive model, and pinning it keeps a cheaper
   machine-wide subagent default from silently weakening the review.
   Pass the `## Review brief` from the
   [design reviewer brief](references/design-reviewer.md)
   as the prompt, with the artifact directory substituted and the paths from the top of this file attached. Each round gets a
   fresh subagent context. `Explore` holds no Write/Edit tools, so the reviewer
   **cannot** change `6-design.md` or forge a verdict artifact. The verdict is
   written by the orchestrator alone (step 4), and downstream discovery fails
   closed on anything but a recorded passing verdict. If the environment lacks the
   `Explore` agent type, treat the dispatch failure like a reviewer crash
   (step 8) — never substitute a full-tool agent silently.
4. **Write the verdict artifact.** With the Write tool, save the reviewer's
   complete report verbatim to a scratch file outside `docs/plans/`, then run
   `<team-skill-dir>/scripts/record-design-review.mjs --dir <artifact-dir>
   --report <file>`. On exit 0 its JSON line names the recorded `path`,
   `round` (`<n>`), `verdict`, `passed`, and `crossModelNotes`. Exit 3 means
   the report carries no verdict token: go to step 8. Exit 1 names a missing
   input to fix and rerun.
5. **The cross-model record is already persisted.** Step 4's run appended
   the report's `### Cross-model disposition` section to
   `cross-model-notes.md` as its `**Design round <n>**` block
   (`crossModelNotes: "appended"`), or appended nothing for a section that
   reads `Not run:` or a report with none. Never append it again by hand. A
   resumed session that repeats a round appends a duplicate-labeled block
   rather than losing one; the file is never read back as state.
6. On **APPROVE or COMMENT** (`passed: true`) → the review passes. Advance
   to STRUCTURE in the same turn.
7. On **REQUEST CHANGES** → re-dispatch `design-author` with the reviewer's
   findings verbatim. The new draft increments `revision: <n+1>` in its
   frontmatter, then a fresh review round runs. The loop ends on the
   verdict: it keeps re-drafting and re-reviewing for as long as the
   reviewer returns REQUEST CHANGES.
8. On an **unparseable verdict or a reviewer crash** → re-dispatch the
   review once with the error. On second failure, halt loudly. Never
   advance on a missing verdict — fail closed. A missing verdict counts as
   not passed ([verified results rules](principles/verified-results.md)).
   The halt message names the absolute worktree-rooted `docs/plans/<id>/`
   path. After
   an operator stop, a context-exhausted session, or this fail-closed
   halt, edit `6-design.md` by hand and re-invoke `/team-design` bare. That
   command resumes at its own review step, never re-drafts an existing
   `6-design.md`, then stops and names `/team-structure` as the next
   command. `/team` also resumes when you give it the same description or
   ticket. Setup steps 4 through 7 re-derive `<id>` and fast-forward the
   ledger to the first incomplete phase. A recovered run can instead
   continue one phase command at a time, through `/team-implement`,
   `/team-review`, and `/team-pr`.
