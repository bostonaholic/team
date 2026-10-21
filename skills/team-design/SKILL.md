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

Before review dispatch, supply the installed plugin root, the resolved `skills/team/references/design-reviewer.md` path, the absolute installed `skills/team/` directory as the base of that brief's links, and the resolved paths of the manuals its `## Review brief` links, all in `skills/team/references/`: `code-reviewer.md`, `code-standards.md`, `design-template.md`, `decisions.md`, `findings.md`, `writing.md`, and `cross-model-review.md` when the prompt carries `## External review input`.
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
`skills/team/SKILL.md`, and `<team-design-skill-dir>` to the absolute
directory containing this installed `SKILL.md`. From the repository root, run:

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
3. **Design review gate.** Run
   `node "<team-design-skill-dir>/scripts/review-record.mjs" status "$ARGUMENTS"`.
   On `passed <n>`, skip straight to step 4 — never re-review a passed
   design. On `pending <n>`, `<n>` is this round's number. Before each
   review dispatch, run the
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
   [design reviewer brief](../team/references/design-reviewer.md),
   substitute the artifact directory, attach the paths named at the top of this file, and give it to a fresh-context
   read-only `Explore` subagent each round. Write the reviewer's report
   verbatim to a scratch file outside `$ARGUMENTS` with the Write tool, then
   run `node "<team-design-skill-dir>/scripts/review-record.mjs" record "$ARGUMENTS" <report-file>`.
   It records `design-review-<n>.md` and any cross-model disposition, and
   prints `round <n>` and `verdict <verdict>`. Exit 3 is an unparseable
   verdict; any other non-zero exit halts loudly with its stderr. Then act
   on the printed verdict:
   - **APPROVE or COMMENT** — the review passes. Advance.
   - **REQUEST CHANGES** — re-dispatch `design-author` with the
     reviewer's findings verbatim. The agent re-drafts and increments
     `revision: <n+1>`, then a fresh review round runs. The loop ends
     on the verdict — no round cap.
   - **Unparseable verdict or reviewer crash** — retry the review once
     with the error; on second failure, halt loudly. Fail closed —
     never advance on a missing verdict ([verified results rules](../team/principles/verified-results.md)).
4. **Stop once `$ARGUMENTS/6-design.md` exists and `status` prints
   `passed <n>`.**

Report design path and tell the user:
**"Next: run `/team-structure docs/plans/<id>/`"**
