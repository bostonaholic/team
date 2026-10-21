Before this operation, read [artifact schema](references/artifacts.md).
Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Rules

- Artifacts in `docs/plans/<id>/` are the single durable record of pipeline
  state. Write phase findings to disk before advancing
  ([durable state rules](principles/durable-state.md)).
- TodoWrite is the live, session-scoped ledger, rebuilt from artifacts on
  entry to any `/team-*` command. Where the host offers no TodoWrite,
  `docs/plans/<id>/ledger.md` substitutes for it, never supplements it: same
  items in the same order, rewritten in place as states change, seeded once
  the leading WORKTREE phase creates the directory, frontmatter per the
  artifact schema. It carries no round state; CODE REVIEW round results live
  in `review-<n>.md` and SECURITY REVIEW's in `security-review-<n>.md` on
  every host. Report which ledger the run used
  ([verified results rules](principles/verified-results.md)).
- **Subagents never pause for user input**, directly or through the
  orchestrator. Each resolves its open questions with its recommended option
  and records each choice as an explicit assumption in its artifact.
- There are **no mid-run human gates**; the adversarial design review gates
  the design. Never present the structure or plan for approval. The structure
  artifact carries no `approved`/`approved_at`/`revision` frontmatter.
- Advance phases within the same turn. IMPLEMENT → CODE REVIEW, CODE REVIEW →
  SECURITY REVIEW, SECURITY REVIEW → PR, and the SECURITY REVIEW → CODE REVIEW
  move back are not stopping points; a turn ending with review verdicts but
  no draft PR URL is a defect.
- The research-isolation invariant (Setup) is non-negotiable. If a
  researcher's context contains the user's original description, stop and
  report the defect.
- On any unexpected failure, report to the user and suggest re-invoking the
  same /team-* command with `docs/plans/<id>/`.
- To add a pipeline agent, add it to the phase table and to the inventory in
  `skills/team/registry.json`.

### Multi-repo topics

A topic touching more than one repository is recorded in
`docs/plans/<id>/4-repos.md`, settled autonomously: the questioner writes it
when the description names multiple repos; the design-author confirms or
amends it on research evidence. Once it exists, research spans every listed repo, slices and plan
steps carry `[repo: <name>]`, secondary worktrees are created after the design
review, the implementer changes directory per step, and PR opens one PR per
repo. Absent, the pipeline runs in single-repo mode.

### Design-review record convention

Passage lives only in `design-review-<n>.md` ("Review records" in the artifact
schema), checked with `scripts/design-review-status.sh`; `6-design.md` carries
no approval frontmatter.
