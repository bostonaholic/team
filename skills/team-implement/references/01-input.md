## Input

`$ARGUMENTS` is the artifact directory: `docs/plans/<id>/`. If empty, the
discovery command below resolves it.

The agents read:

- `$ARGUMENTS/8-plan.md` — file-level steps and per-slice tests
- `$ARGUMENTS/7-structure.md` — slice ordering and verification checkpoints
- `$ARGUMENTS/6-design.md` — context for what each test should assert
- `$ARGUMENTS/4-repos.md` — repo scope (only present when the topic spans more
  than one repository). The implementer cd's between worktrees as the plan
  steps require
- `$ARGUMENTS/1-task.md` — intent (for the implementer when in standalone mode)

Resolve `<team-skill-dir>` to the absolute directory containing
`skills/team/SKILL.md`. From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "8-plan.md"
```

- **If the command printed a path**, use it as `$ARGUMENTS` for the rest of this
  skill (tier 1 explicit arg, or tier 2 discovery). When the path came from
  tier 2 (no explicit arg), announce the resolved directory to the user before
  proceeding, so an auto-picked topic is never silent.
- **If the command printed nothing** (tier 3 — no directory under `docs/plans/`
  holds `8-plan.md`), do not hard-error. Fire
  `AskUserQuestion` with a `Setup` header and labeled options:
  - **Run the producer** — run `/team-plan docs/plans/<id>/` to produce the
    missing `8-plan.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).
  - **Describe the task** — the user types a 1–2 sentence description of what
    to implement. Derive a fresh `<id>` (date-prefixed kebab slug, the same way
    the questioner does), create `docs/plans/<id>/1-task.md` from that
    description, then proceed from the new directory in **standalone mode**.

**Standalone mode** — the resolved or provided directory has no `8-plan.md`, so
the run starts from that directory's `1-task.md` instead. It triggers whenever
tier 1 (explicit `$ARGUMENTS`), a user-provided path, or a freshly derived
directory (from **Describe the task**) names a `docs/plans/<id>/` that lacks
`8-plan.md`. The directory is always defined in this case.
If `$ARGUMENTS/8-plan.md` does not exist in it, run `test-architect` →
`implementer` → reviewers from `$ARGUMENTS/1-task.md` alone.

Coordinate progress through TodoWrite. Seed:
`Test-architect → Mechanical gate → Implementer (per slice) → Review round 1`.
See `principle-progress-tracking` for the per-step tracking convention
agents follow within each phase.
