## Rules

- Artifacts in `docs/plans/<id>/` are the single durable record of
  pipeline state. Each artifact's YAML frontmatter describes its phase
  and revision metadata. Write phase findings to disk before advancing.
  The file, not conversation memory, is the interface (`principle-files-are-the-contract`).
- TodoWrite is the orchestrator's live coordination ledger. It is
  session-scoped and is rebuilt on entry to any `/team-*` command by
  scanning artifacts.
- **Subagents never pause for user input.** Each one resolves its own open
  questions autonomously, and picks the option it would have recommended.
  It records every such choice as an explicit assumption in its artifact,
  so the guess stays auditable at PR review. No subagent prompts the user,
  directly or through the orchestrator.
- There are **no mid-run human gates**. The design is gated by an
  adversarial design review. Never present the structure or plan for
  approval. The structure and plan are autonomous tactical artifacts.
- The phase loop never pauses mid-run. Advance phases within the same turn.
  IMPLEMENT → PR is not a stopping point. A turn that ends with review
  verdicts but no draft PR URL is a defect.
- The research-isolation invariant is non-negotiable. If a researcher's
  context contains the user's original description, the pipeline has a
  defect. Stop and report.
- On any unexpected failure: report to the user and suggest re-invoking
  the same /team-* command with `docs/plans/<id>/`.
- To add a new agent to the pipeline, add an entry to the phase table
  above and to the inventory in `skills/team/registry.json`.

### Multi-repo topics

A topic that touches more than one repository is recorded in
`docs/plans/<id>/4-repos.md` (schema in
`skills/artifact-frontmatter/SKILL.md`). `4-repos.md` is settled
autonomously. The questioner writes it when the description names multiple
repos (resolving each to a sibling-directory path), and the design-author
confirms or amends the list on research evidence. Once `4-repos.md` exists,
every downstream phase respects it: research spans every listed repo,
slices and plan steps carry `[repo: <name>]` annotations, secondary
worktrees are created after the design review (the home worktree already
exists from the leading WORKTREE phase), the implementer changes directory
between them per step, and PR opens one PR per repo. When `4-repos.md` is
absent, the pipeline runs in single-repo mode (today's default).

### Design-review record convention

The durable record of design-review passage is
`docs/plans/<id>/design-review-<n>.md` — one file per review round,
with frontmatter `topic`, `date`, `phase: design-review`, and
`verdict: <APPROVE|REQUEST CHANGES|COMMENT>`. A design has passed review
when the highest-`<n>` file carries APPROVE or COMMENT. Downstream
phases and the recovery hooks verify passage by reading that file —
`6-design.md` itself carries no approval frontmatter.
See `skills/artifact-frontmatter/SKILL.md` for the full frontmatter
convention.
