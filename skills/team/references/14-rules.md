Before this operation, read [artifact schema](references/artifacts.md).
Resolve these links from the installed `SKILL.md` directory. If a read fails, stop and report its resolved path.

## Rules

- Where the host offers no TodoWrite, `docs/plans/<id>/ledger.md`
  substitutes for it — never supplements it. Same items in the same
  order, rewritten in place as their states change, seeded once the
  leading WORKTREE phase creates the directory; frontmatter per
  [artifact schema](references/artifacts.md). Report which of the two the run used
  ([verified results rules](principles/verified-results.md)).
- **Subagents never pause for user input.** Each one resolves its own open
  questions autonomously by picking the option it would have recommended,
  and records every such choice as an explicit assumption in its artifact.
  No subagent prompts the user, directly or through the orchestrator.
- Never present the structure or plan for approval. The structure and plan
  are autonomous tactical artifacts.
- The research-isolation invariant is non-negotiable. If a researcher's
  context contains the user's original description, the pipeline has a
  defect. Stop and report.
- On any unexpected failure: report to the user and suggest re-invoking
  the same /team-* command with `docs/plans/<id>/`.

### Multi-repo topics

`4-repos.md` is settled autonomously. The questioner writes it when the
description names multiple repos (resolving each to a sibling-directory path),
and the design-author confirms or amends the list on research evidence. Once
`4-repos.md` exists, every downstream phase respects it: research spans every
listed repo, slices and plan steps carry `[repo: <name>]` annotations,
secondary worktrees are created after the design review, the implementer
changes directory between them per step, and PR opens one PR per repo.
