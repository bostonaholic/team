# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Code reviews no longer emit praise comments.** The `praise` Conventional Comments type is removed from `skills/code-review/SKILL.md`, and the matching inline list + "Be fair. Acknowledge what is done well…" rule are removed from `agents/code-reviewer.md`. Reviewer output is restricted to types that require author action or attention (`issue`, `suggestion`, `nitpick`), raising signal-to-noise. Verdict criteria, gate types, and aggregation rules are unchanged.
- **Edge-case enumeration is mandatory in design and tests.** The `design-author` agent now writes a dedicated `## Edge cases` section walking six categories (boundary values, invalid inputs, failure paths, concurrency, authorization, resource limits); the `structure-planner` pulls those scenarios into each slice's acceptance tests; the `test-architect` writes them with the same care as happy-path tests and reports any gap as an upstream structure defect rather than inventing tests. Reinforced by methodology updates in `test-first-development`, `technical-design-doc`, and `engineering-standards`.

### Added

- **`design-doc-reviewer` agent + `/team-design-review` skill.** A new sonnet-tier, read-only review agent at `agents/design-doc-reviewer.md` adversarially reviews technical design documents (`docs/plans/<id>/design.md`, standalone TDDs) with fresh context. Preloads four methodology skills via the `skills:` frontmatter field — `technical-design-doc`, `code-review`, `engineering-standards`, `documenting-decisions` — so the agent boots with the spec, review discipline, design philosophy, and ADR-quality criteria already in context. Produces the same hard-gating verdicts as `code-reviewer` (APPROVE / REQUEST CHANGES / COMMENT). Registered under phase `DESIGN` in `skills/team/registry.json` to satisfy the dev sync hook. Invokable two ways: ad-hoc via the Agent tool, or via the new `/team-design-review docs/plans/<id>/` slash command (skill at `skills/team-design-review/SKILL.md`) which is **optional** and **not part of the QRSPI phase table** — it dispatches the agent, presents the verdict, and never auto-revises `design.md` or flips the `approved` frontmatter.
- **Multi-repo topics.** A single `/team` pipeline can now span more than one repository. When the questioner detects multiple repos in the description (or the design-author confirms it during open-questions), it writes `docs/plans/<id>/repos.md` listing each involved repo's slug, absolute path, and role. The Worktree phase then creates a worktree per repo (`<repo>/.claude/worktrees/<id>`, all on the same `<id>` branch); the structure annotates each slice with the repos it touches; the planner prefixes each step with `[repo: <slug>]`; the implementer cd's between worktrees per step and produces one commit per repo; the PR phase opens one cross-linked PR per repo. Single-repo topics keep today's behavior — `repos.md` is optional and absent by default.

### Fixed

- **Worktree-isolation skill documented phase 6 placement.** `skills/worktree-isolation/SKILL.md` previously said worktree creation happens "before any agent is dispatched," which contradicted the phase table at `skills/team/SKILL.md` (WORKTREE is phase 6 of 8, after PLAN and before IMPLEMENT). The Setup section is rewritten to describe phase-6 placement directly, a new "Why late" subsection captures the two load-bearing rationales (human gates land on `main`; branch scope is a Plan output), and `skills/qrspi-workflow/SKILL.md` now cross-links to that rationale from its WORKTREE phase block. **No behavior change** — every phase still runs where it ran before.

## [0.2.1] - 2026-05-07

### Changed

- **Use Claude Code's `AskUserQuestion` at every multi-choice prompt.** The `design-author` agent now opens the open-questions step with the built-in `AskUserQuestion` tool (multi-choice with labeled trade-offs) instead of printing a markdown numbered list and waiting for free-text. The orchestrator skills (`team`, `team-design`, `team-structure`, `team-implement`, `team-pr`) use `AskUserQuestion` for human-gate verdicts (Approve / Request changes / Reject), the worktree-vs-in-place decision, and shipping options (Open PR / Keep commits locally / Keep as-is). Locked in by `tests/ask-user-question-tool-tests.sh`.

### Fixed

- **Artifact frontmatter `topic` consistency.** Pipeline agents could write inconsistent `topic` values across artifacts in the same `docs/plans/<id>/` directory (e.g. `task.md` carrying the kebab slug while `questions.md` carried the ticket id and `research.md` carried a mash of both). Every agent now copies `topic` verbatim from its predecessor artifact, and the questioner is the single point where the value is chosen — the kebab portion of `<id>`. The invariant is documented in `qrspi-workflow` and locked in by `tests/topic-consistency-tests.sh`. The `ticketId` scope rule (only on `task.md`) is now documented as well.

## [0.2.0] - 2026-05-06

### Added

- **QRSPI pipeline.** Eight-phase implementation workflow: Question → Research → Design → Structure → Plan → Worktree → Implement → PR.
- **Slash commands.** `/team` (full pipeline), `/team-fix` (compressed bug-fix), and per-phase entry points: `/team-question`, `/team-research`, `/team-design`, `/team-structure`, `/team-plan`, `/team-worktree`, `/team-implement`, `/team-pr`.
- **Specialized agents.** Thirteen agents covering the pipeline: questioner, researcher, file-finder, design-author, structure-planner, planner, test-architect, implementer, code-reviewer, security-reviewer, ux-reviewer, technical-writer, verifier.
- **Skill library.** Twenty-four skills spanning entry points and methodologies (engineering-standards, code-review, refactoring-to-patterns, SOLID principles, test-first development, systematic debugging, technical design docs, PRDs, ADRs, and more).
- **Two human gates.** Design approval (~200-line alignment doc) and Structure approval (~2-page vertical-slice breakdown). Everything outside these gates runs autonomously with mechanical gates.
- **Adversarial verification.** Five-reviewer hard-gate retry loop in the Implement phase enforces zero-tolerance quality gates.
- **Test-first scope fence.** Failing acceptance tests are written from the approved structure before implementation and act as an immutable scope contract.
- **Blind research.** The researcher operates from `questions.md` only and never sees the user's original task description, eliminating prompt bias.
- **Auto-revise on critic findings.** Plans with non-PASS critic verdicts are revised automatically before the human gate.
- **Beads (bd) integration.** Issue status flows through the pipeline lifecycle for multi-session work and dependency tracking.
- **Plugin hooks.** `pre-bash-guard` (prompts on dangerous commands instead of hard-blocking), `pre-compact-anchor` (preserves active phase across context compaction), `session-start-recover` (surfaces active topic and suggested next command on resume), `post-write-validate` (structural validation of plugin files).
- **Artifact-based state.** Per-id `docs/plans/<id>/` directories of Markdown artifacts with YAML frontmatter (`phase`, `approved`, `revision`) drive the orchestrator; live progress is coordinated via TodoWrite.
- **Documentation site.** Jekyll site published at [team.bostonaholic.dev](https://team.bostonaholic.dev).
- **License.** MIT.

### Changed

- Replaced the earlier 6-phase RPI workflow with the 8-phase QRSPI pipeline.

[Unreleased]: https://github.com/bostonaholic/team/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/bostonaholic/team/releases/tag/v0.2.1
[0.2.0]: https://github.com/bostonaholic/team/releases/tag/v0.2.0
