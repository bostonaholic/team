# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/bostonaholic/team/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bostonaholic/team/releases/tag/v0.2.0
