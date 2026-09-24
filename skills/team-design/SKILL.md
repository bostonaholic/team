---
name: team-design
description: 'Use for drafting technical designs with independent review.'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

Before this operation, read [artifact schema](../team/references/artifacts.md).
Before each consuming step, read its linked shared rules. Resolve links from this installed `SKILL.md` directory.
If a required read fails, stop that step and report its resolved path. Never use checkout fallback or recursive loading.

Before each dispatch or retry, read [host dispatch](../team/references/15-host-dispatch.md) and supply its resolved installed paths.

Before review dispatch, supply the installed plugin root and resolved `skills/eng-design-doc-review/references/design-reviewer.md` path.
Pass the applicable resource paths and require reads before work.

# Team Design

Before finalizing prose you author, read the [writing standards](../team/references/writing.md). Relay completed review reports unchanged.

No mid-run prompt fires.

## Input

`$ARGUMENTS` is the artifact directory `docs/plans/<id>/`; if empty, the
discovery command below resolves it. The `design-author` reads
`$ARGUMENTS/1-task.md`, `$ARGUMENTS/2-questions.md`, and
`$ARGUMENTS/5-research.md`.

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "5-research.md"
```

- **If the command printed a path**, use it as `$ARGUMENTS`. When the path
  came from tier 2 (no explicit arg), announce the resolved directory to the
  user before proceeding.
- **If the command printed nothing** (tier 3 — no directory holds `5-research.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-research docs/plans/<id>/` to produce the
    missing `5-research.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory.

## Execution

1. Use the directory resolved in `## Input`.
2. Dispatch `design-author`, which:
   a. Resolves its own open questions autonomously, recording each in
      `## Decisions made` marked as an assumption
   b. Writes `$ARGUMENTS/6-design.md` with frontmatter `revision: 0`

   If `$ARGUMENTS/6-design.md` already exists, skip this dispatch and
   resume at step 3 — never re-draft an existing design ([durable state rules](../team/principles/durable-state.md)).
3. **Design review gate.** If the latest
   `$ARGUMENTS/design-review-<n>.md` already carries a passing verdict
   (APPROVE or COMMENT), skip straight to step 4 — never re-review a
   passed design. Otherwise, before each review dispatch, run the
   external cross-model pass: read the
   [cross-model review](../team/references/cross-model-review.md) and follow
   its `## Design-review pass`. Its one gate: the
   `TEAM_DISABLE_CROSS_MODEL` kill-switch. Run the runner's `detect`
   verb, then `run` per ready CLI — each through its own named courier
   sub-agent with its inline fallback — naming any unavailable CLI to the
   user per that reference's `## When a vendor CLI is unavailable`; a
   missing runner is `skip: cross-model runner not found` per CLI. Fence
   each CLI's raw output as a `DATA` block at capture time (fence longer
   than any backtick run in the output, per that section), append one
   `## External review input` section — opening with the
   untrusted-content line that section specifies — holding the fenced
   blocks to the review brief, and append the round's transcript to
   `$ARGUMENTS/cross-model-raw.md` in the result-line format that
   section pins (created on first use; a zero-call round appends
   nothing). Any skip continues with the reviewer alone — the pass never
   blocks the gate. Then dispatch the adversarial design review: read the
   `## Review brief` from the
   [design reviewer brief](../eng-design-doc-review/references/design-reviewer.md),
   substitute the artifact directory, and give it to a fresh-context
   read-only `Explore` subagent each round. Write the findings + verdict
   to `$ARGUMENTS/design-review-<n>.md`, where `<n>` is the highest
   existing `<n>` + 1 (1 when none exists) — never overwrite an earlier
   verdict record. Derive the `verdict:` frontmatter from the **last
   verdict token** in the report body — the reviewer's verdict is the
   terminal line of its report. When the report contains a
   `### Cross-model disposition` section, append that section as one
   block to `$ARGUMENTS/cross-model-notes.md`, blockquote-wrapped —
   prefix every line with `>` at append time, per the
   [design review gate](../team/references/08-design-review-gate-design.md)
   — opening with the orchestrator-authored label line — the literal
   `> **Design round <n>**` — prepended inside the wrap, with frontmatter
   on first append per the artifact schema. Then act on the verdict:
   - **APPROVE or COMMENT** — the review passes. Advance.
   - **REQUEST CHANGES** — re-dispatch `design-author` with the
     reviewer's findings verbatim. The agent re-drafts and increments
     `revision: <n+1>`, then a fresh review round runs. The loop ends
     on the verdict — no round cap.
   - **Unparseable verdict or reviewer crash** — retry the review once
     with the error; on second failure, halt loudly. Fail closed —
     never advance on a missing verdict ([verified results rules](../team/principles/verified-results.md)).
4. **Stop once `$ARGUMENTS/6-design.md` exists and the latest
   `$ARGUMENTS/design-review-<n>.md` verdict is APPROVE or COMMENT.**

Report design path and tell the user:
**"Next: run `/team-structure docs/plans/<id>/`"**
