## Input

`$ARGUMENTS` is the artifact directory `docs/plans/<id>/`, optional. Resolve
`<team-skill-dir>` to the absolute directory containing `skills/team/SKILL.md`.
From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "8-plan.md"
```

- **It printed a path** → use it as `$ARGUMENTS`. When it came from discovery
  (no explicit arg), announce the resolved directory to the user before
  proceeding, so an auto-picked topic is never silent.
- **It printed nothing** (no directory holds `8-plan.md`) → do not hard-error.
  Fire `AskUserQuestion` with a `Setup` header and labeled options:
  - **Run the producer** — run `/team-plan docs/plans/<id>/` to produce the
    missing `8-plan.md`.
  - **Give a path** — the user supplies the `docs/plans/<id>/` directory
    directly (run `ls docs/plans/` to find your topic directory).
