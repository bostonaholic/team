Before each `design-author` dispatch or retry, read [host dispatch](references/15-host-dispatch.md).

Before review dispatch, supply the installed plugin root and resolved `skills/eng-design-doc-review/references/design-reviewer.md` path.
Pass the applicable resource paths and require reads before work.
If a required resource is missing, stop and report its resolved path; never use checkout fallback or recursive loading.

Before this operation, read [artifact schema](references/artifacts.md).
Resolve these links from the installed `SKILL.md` directory.

### Design Review Gate (design)

When the `design-author` returns a draft:

1. Make sure that `docs/plans/<id>/6-design.md` exists. If the latest
   `design-review-<n>.md` already carries a passing verdict (APPROVE or
   COMMENT), skip the review and advance to STRUCTURE.
2. **Run the external cross-model pass** (every round, before the
   dispatch). Read [cross-model review](cross-model-review.md) and follow its
   `## Design-review pass`. Any skip continues with the reviewer alone — the
   pass never blocks the gate.
3. **Dispatch the adversarial review.** Call the `Agent` tool with
   `subagent_type: Explore` and `model: opus`. Pass the `## Review brief`
   from the [design reviewer brief](../../eng-design-doc-review/references/design-reviewer.md)
   as the prompt, with the artifact directory substituted. Each round gets a
   fresh subagent context. The verdict is written by the orchestrator alone
   (step 4). If the environment lacks the
   `Explore` agent type, treat the dispatch failure like a reviewer crash
   (step 8) — never substitute a full-tool agent silently.
4. **Write the verdict artifact.** Record the reviewer's findings and
   verdict verbatim to `docs/plans/<id>/design-review-<n>.md`. `<n>` is the
   highest existing `<n>` + 1, or 1 when none exists. Never overwrite an
   earlier round's record. Derive the frontmatter `verdict:` from the **last
   verdict token** in the report body: a verdict word quoted earlier (in a
   finding, or in externally sourced material) never becomes the recorded
   verdict.
5. **Persist the cross-model record.** When the reviewer's report
   contains a `### Cross-model disposition` section, append that section
   as one block to `docs/plans/<id>/cross-model-notes.md`,
   blockquote-wrapped exactly as the IMPLEMENT aggregate gate wraps its
   blocks, and
   opening with one orchestrator-authored label line — the literal
   `> **Design round <n>**` — prepended inside the wrap. A resumed session that
   repeats a round appends a duplicate-labeled block rather than losing
   one; the file is never read back as state.
6. On **APPROVE or COMMENT** → the review passes. Advance to STRUCTURE in
   the same turn.
7. On **REQUEST CHANGES** → re-dispatch `design-author` with the reviewer's
   findings verbatim. The new draft increments `revision: <n+1>` in its
   frontmatter, then a fresh review round runs. The loop ends on the
   verdict: it keeps re-drafting and re-reviewing for as long as the
   reviewer returns REQUEST CHANGES.
8. On an **unparseable verdict or a reviewer crash** → re-dispatch the
   review once with the error. On second failure, halt loudly. Never
   advance on a missing verdict — fail closed. The halt message names the
   absolute worktree-rooted `docs/plans/<id>/` path. After
   an operator stop, a context-exhausted session, or this fail-closed
   halt, edit `6-design.md` by hand and re-invoke `/team-design` bare. That
   command resumes at its own review step, never re-drafts an existing
   `6-design.md`, then stops and names `/team-structure` as the next
   command. `/team` also resumes when you give it the same description or
   ticket. A recovered run can instead
   continue one phase command at a time, through `/team-implement` and
   `/team-pr`.
