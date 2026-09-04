---
name: team-structure
description: 'Breaks a reviewed design into verified slices. Trigger on "slice this up", "break the design into steps", or "/team-structure".'
effort: medium
argument-hint: "[docs/plans/<id>/]"
---

# Team Structure — How Do We Get There?

Run the STRUCTURE phase. It runs autonomously and advances to PLAN — there
is **no gate** here. Nothing is presented for approval mid-run.

## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery command below resolves it.

The `structure-planner` reads:

- `$ARGUMENTS/6-design.md` (the reviewed design — the latest
  `$ARGUMENTS/design-review-<n>.md` must carry a passing verdict)
- `$ARGUMENTS/5-research.md`
- `$ARGUMENTS/1-task.md` (for cross-reference, not for re-litigating intent)

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run the command below. Its
predecessor filter requires a `6-design.md` whose latest
`design-review-<n>.md` carries a passing verdict (APPROVE or COMMENT), so
unreviewed or REQUEST-CHANGES candidates are skipped:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "6-design.md" --require-passing-review
```

- **If the command printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery of a reviewed predecessor).
  When the path came from tier 2 (no explicit arg), announce the resolved
  directory to the user before proceeding, so an auto-picked topic is never
  silent.
- **If the command printed nothing** (tier 3 — no directory holds a
  `6-design.md` with a passing design review), do not hard-error. Fire
  `AskUserQuestion` with a `Setup` header
  and labeled options:
  - **Run the producer** — run `/team-design docs/plans/<id>/` to produce
    and review `6-design.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).

## Execution

1. Use the directory resolved in `## Input`, then **verify the review gate**:
   the highest-`<n>` `$ARGUMENTS/design-review-<n>.md` must carry
   `verdict: APPROVE` or `verdict: COMMENT` **in its YAML frontmatter** (the
   tier-2 filter already enforced this. Re-check a tier-1 explicit path). If
   no review artifact exists, or the latest verdict is REQUEST CHANGES,
   **refuse**: report that the design has not passed review and suggest
   `/team-design $ARGUMENTS` — never slice an unreviewed design.
   No recorded verdict counts as not passed (`principle-fail-closed`).
2. Dispatch `structure-planner`, which writes `$ARGUMENTS/7-structure.md`
   with vertical slices. The artifact carries plain frontmatter
   (`topic`, `date`, `phase: structure`) — no approval fields, because
   structure is not gated.
3. **No gate. Nothing is presented for approval mid-run.** Within a full
   `/team` run the orchestrator advances to PLAN automatically. Run
   standalone, this skill stops after writing the structure and reports the
   next command.
4. **Stop once `$ARGUMENTS/7-structure.md` exists.**

Report the structure path. When run standalone, tell the user:
**"Next: run `/team-plan docs/plans/<id>/`"**
(Within a full `/team` run the orchestrator advances to PLAN automatically.)
