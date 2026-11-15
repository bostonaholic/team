# Vision

Team is a process, built from skills that compose. It defines the agentic software development lifecycle: the phase order, the review loops, the gates, and the artifacts that carry state from one phase to the next. It does not define what a PR body, a commit message, or a changelog entry says. Other skills the host has installed own that content, and Team never names them.

For the end state of the board-driven loop, read [docs/vision.md](docs/vision.md). For the principles that make the autonomous middle trustworthy, read [docs/ethos.md](docs/ethos.md). This file states how Team is built so that it can reach that end state: by composition.

## Team is composed from its own skills

Each phase is a skill: `team-question`, `team-research`, `team-design`, `team-structure`, `team-plan`, `team-implement`, `team-code-review`, `team-security-review`, `team-pr`, and `team-worktree`. Each runs on its own when a user names it, and each reads its inputs from and writes its outputs to `docs/plans/<id>/`.

`/team` is the composition. It walks the phase table, calls each phase skill in order, and decides from the artifacts on disk which phase runs next. `/team-fix` composes a shorter path of the same parts for a bug. A new workflow is a new composition of phase skills, not a copy of their contents.

Inside a phase, agents compose the same way. A phase skill dispatches named agents (`questioner`, `researcher`, `design-author`, `implementer`, `code-reviewer`, `security-reviewer`, and the rest) with a payload of paths. Each agent starts with fresh context and returns a report. The phase skill decides; the agent does the work.

## The contract between parts is files

Phase skills and agents do not share conversation state. They share files with a fixed schema: `1-task.md`, `6-design.md`, `8-plan.md`, `review-<n>.md`, `security-review-<n>.md`. Because the contract is a file, any phase can be rerun, resumed after a crash, or replaced, as long as the replacement reads and writes the same files.

## Team owns process, not content

Team owns these:

- The phase order and the conditions that move a run from one phase to the next.
- The loops: adversarial design review, the code review fix loop, and the security review fix loop. Each ends only when no Blocking or Major finding remains.
- The gates: the mechanical test gate, the tree check around reviewers, and the rule that no mid-run step asks the human.
- The facts each step produces: the why, the check results, the review and security status, the evidence gaps.

Team does not own these:

- How a PR body is laid out, how a commit message is written, how a changelog bullet reads, or how screenshots are uploaded.

When Team reaches a step such as "open a draft PR" or "update the changelog", it states the step and passes the facts. The host loads whatever skills match that step. A user with no such skills still gets a PR. A user with skills for PR bodies, commits, and changelogs gets their rules applied, and changes those rules without a Team release.

This split is the reason Team names no outside skill. A process that names a content skill has to change when that skill changes, and two repositories end up holding the same rule. Team states what must happen; the composed skills decide how the result reads.

## Where this is going

- Every phase skill stays usable on its own, so a user can compose part of the pipeline into other work.
- New behavior lands as a new phase skill, a new agent, or a new gate, and `/team` composes it. It does not land as more text inside an existing phase.
- Content rules that appear in Team move out. Team keeps only the steps, the loops, the gates, and the facts.
- The board-driven loop in [docs/vision.md](docs/vision.md) is one more composition: a controller that calls `/team` for each ready item.
