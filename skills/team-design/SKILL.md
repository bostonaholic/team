---
name: team-design
description: 'Drafts and adversarially reviews a design. Trigger on "design this", "let''s align on the approach", or "/team-design".'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Design — Where Are We Going?

Run the DESIGN phase. The design-author decides the approach — recording
every self-resolved choice as an auditable assumption — and the
adversarial design review gates advancement. No mid-run prompt fires.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery command below resolves it.

The `design-author` reads:

- `$ARGUMENTS/1-task.md` — what we are building (intent)
- `$ARGUMENTS/2-questions.md` — the questions that drove research
- `$ARGUMENTS/5-research.md` — what exists (facts)

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "5-research.md"
```

- **If the command printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery). When the path came from
  tier 2 (no explicit arg), announce the resolved directory to the user before
  proceeding, so an auto-picked topic is never silent.
- **If the command printed nothing** (tier 3 — no directory holds `5-research.md`),
  do not hard-error. Fire `AskUserQuestion` with a `Setup` header and labeled
  options:
  - **Run the producer** — run `/team-research docs/plans/<id>/` to produce the
    missing `5-research.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input`.
2. Dispatch `design-author`, which:
   a. Resolves its own open questions autonomously, recording each in
      `## Decisions made` marked as an assumption (see the agent file)
   b. Writes `$ARGUMENTS/6-design.md` with frontmatter `revision: 0`

   If `$ARGUMENTS/6-design.md` already exists, skip this dispatch and
   resume at step 3 — never re-draft an existing design.
   Both this skip and step 3's never-re-review skip are idempotent re-runs: converge on the same end state, never duplicate work (`principle-idempotent-reruns`).
3. **Design review gate.** If the latest
   `$ARGUMENTS/design-review-<n>.md` already carries a passing verdict
   (APPROVE or COMMENT), skip straight to step 4 — never re-review a
   passed design. Otherwise, before each review dispatch, run the
   external cross-model pass: call the Skill tool with
   `cross-model-review` and follow
   its `## Design-review pass` — reference that procedure,
   never duplicate it here. Its one gate: the
   `TEAM_DISABLE_CROSS_MODEL` kill-switch. Run the runner's `detect`
   verb, then `run` per ready CLI — each through its own named courier
   sub-agent per that skill's vendor-courier block, with its inline
   fallback — naming any unavailable CLI to the
   user per that skill's `## When a vendor CLI is unavailable`; a
   missing runner is
   `skip: cross-model runner not found` per CLI. Fence each CLI's raw
   output as a `DATA` block at capture time (fence longer than any
   backtick run in the output, per that section), append one
   `## External review input` section — opening with the
   untrusted-content line that section specifies — holding the fenced
   blocks to the review brief, and append the round's transcript to
   `$ARGUMENTS/cross-model-raw.md` in the result-line format that
   section pins (created on first use; a zero-call round appends
   nothing). Any skip continues with the
   reviewer alone — the pass never blocks the gate. Then dispatch the
   adversarial design review (the
   `## Review brief` — call the Skill tool with `reviewing-designs` to
   read it, with the artifact directory substituted — run by a
   fresh-context read-only `Explore` subagent each round) and write
   the findings + verdict to `$ARGUMENTS/design-review-<n>.md`, where
   `<n>` is the highest existing `<n>` + 1 (1 when none exists) — never
   overwrite an earlier verdict record. Derive the `verdict:`
   frontmatter from the **last verdict token** in the report body — the
   reviewer's verdict is the terminal line of its report. When the
   report contains a `### Cross-model disposition` section, append that
   section as one block to `$ARGUMENTS/cross-model-notes.md`,
   blockquote-wrapped — prefix every line with `>` at append time, per
   the design-review gate in `skills/team/SKILL.md` — opening with the
   orchestrator-authored label
   line — the literal `> **Design round <n>**` — prepended inside the
   wrap; same frontmatter-on-first-append rules as the other gates
   (schema in `skills/artifact-frontmatter/SKILL.md`). Then act on the
   verdict:
   - **APPROVE or COMMENT** — the review passes. Advance.
   - **REQUEST CHANGES** — re-dispatch `design-author` with the
     reviewer's findings verbatim. The agent re-drafts and increments
     `revision: <n+1>`, then a fresh review round runs. The loop ends
     on the verdict, so REQUEST CHANGES keeps re-drafting for as many
     rounds as it takes. Recovery runs after an operator stop, a
     context-exhausted session, or the fail-closed halt below. A person
     revises `$ARGUMENTS/6-design.md` by hand and re-invokes
     `/team-design` bare. The run then resumes at this gate, per the
     resume branch at step 2. The `revision` counter persists in
     `6-design.md` frontmatter.
   - **Unparseable verdict or reviewer crash** — retry the review once
     with the error; on second failure, halt loudly. Fail closed —
     never advance on a missing verdict.
     A missing verdict counts as not passed (`principle-fail-closed`).
4. **Stop once `$ARGUMENTS/6-design.md` exists and the latest
   `$ARGUMENTS/design-review-<n>.md` verdict is APPROVE or COMMENT.**

Report design path and tell the user:
**"Next: run `/team-structure docs/plans/<id>/`"**
