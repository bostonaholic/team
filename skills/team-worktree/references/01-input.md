## Input

`$ARGUMENTS` is the artifact directory `docs/plans/<id>/`, optional. Resolve
`<team-skill-dir>` to the absolute directory containing `skills/team/SKILL.md`.
From the repository root, run:

```sh
"<team-skill-dir>/discover-topic.sh" "${ARGUMENTS:-}" "8-plan.md"
```

- **Printed a path** → use it as `$ARGUMENTS`. If it came from discovery (no
  explicit arg), announce the resolved directory before proceeding.
- **Printed nothing** → do not hard-error. Fire `AskUserQuestion` with a
  `Setup` header and labeled options:
  - **Run the producer** — run `/team-plan docs/plans/<id>/` to produce `8-plan.md`.
  - **Give a path** — the user supplies `docs/plans/<id>/` (`ls docs/plans/` lists them).
