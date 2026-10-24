---
title: Invariants
description: "The hard invariants Team states, each with its enforcement status, its check and automatic caller, and the reason or residue for each gap."
audience: [developer]
nav_order: 8
nav_label: invariants
---

# Invariants

This page lists the 33 hard invariants of Team and names the check that enforces each one. Use it to learn if a rule has a check, what calls that check, and which violations still pass. A PR that adds, removes, or rewires a check updates its row in the same PR.

## What counts as a hard invariant

A hard invariant is a rule in `AGENTS.md`, `docs/architecture.md`, or a pipeline reference whose violation corrupts a durable outcome. Durable outcomes are a tool grant, a gate verdict, an artifact contract, a branch, a version, or a release.

Method guidance is not a hard invariant. Examples are the rules on how to research, write, or review. That guidance governs judgment quality, and a future agent-behavior eval suite owns it.

## Where the rows come from

These commands and sections give the source set. Rerun them to make sure that each rule they surface maps to a row:

- `rg -n -i '\binvariant|non-negotiable' AGENTS.md docs/architecture.md skills/team/references/*.md skills/team/principles/*.md`
- The five bullets under `AGENTS.md` "Learned rules".
- `rg -n -i '\b(never|must)\b' skills/team/references/artifacts.md`, the schema contract.
- The must and never statements in `AGENTS.md` "Agents (13)" and "Hooks", and the plugin checks under `AGENTS.md` "Cursor Cloud specific instructions".
- The `docs/architecture.md` "Checks and balances" table and the section 1 principles.
- The gates that already have a script, such as `branch-gate.sh` (`skills/team-fix/references/05-worktree.md`).

## Status terms

Two terms come first:

- A *check* is code that fails, refuses, or denies on a violation. A writer script whose output obeys the rule by construction also counts.
- A *covered violation* breaks the rule's own text and can arrive through a pull request to `main` or a pipeline run of this repository's code.

Three gaps fall outside a covered violation. The row still names each one:

1. State this repository does not hold, such as a user's untracked files or environment variables.
2. A gap that a GitHub setting closes, such as a direct push to `main`.
3. Harness behavior the rule's text does not claim.

Each Status cell holds exactly one of four tokens:

- `mechanical`: a check runs with no person or agent step, in CI, a release workflow, or a dev hook. It fails on every covered violation before that violation lands on `main` or ships in a release.
- `both`: a check fails on every covered violation it sees, but it runs only when a person or an agent follows a prose step that calls it.
- `both (partial)`: a check exists, but a covered violation can pass it, or can land with no run of it. The row names that violation.
- `prose-only`: no check exists. The row says "not mechanizable" or "deferred" and gives the reason.

## The gap the CI rows share

Rows 1, 22, 25, and 26 run in `.github/workflows/checks.yml` on each pull request to `main`. They share one gap that a GitHub setting closes. A direct push to `main`, which `CONTRIBUTING.md` "Making a change" forbids, runs no check. A merge while `Checks` is red also lands. Branch protection that makes `Checks` a required status check closes the gap. So a CI row's residue reads "None" when nothing else applies.

## Inventory

| # | Invariant | Stated in | Status | Check and automatic caller | Reason or residue |
|---|---|---|---|---|---|
| 1 | Registry agent names equal `agents/*.md` names | `AGENTS.md` "Agents (13)" | mechanical | `check-agents.mjs` rules `registry-sync`, `agent-frontmatter`, `registry-json`. CI and dev hook | None |
| 2 | A reviewer holds no file-writing tool | `AGENTS.md` "Agents (13)", `docs/architecture.md` "Checks and balances" | both (partial) | `reviewer-set` (a pinned reviewer table) and `reviewer-tools` (a tool allowlist). CI and dev hook. The harness applies the grant at dispatch | Three covered violations pass. A reviewer that only a skill dispatch line names, with no table row and a registry phase other than `CODE REVIEW` or `SECURITY REVIEW`, escapes. A tracked `.claude/agents/<name>.md` copy shadows the plugin agent's `tools` (`docs/architecture.md` "Model tiering"), and the checker never reads it. On the body-load path, the orchestrator grants tools by following prose (`15-host-dispatch.md` "Agent dispatch") |
| 3 | A reviewer declares `permissionMode: plan` | same | both (partial) | `reviewer-permission-mode`. CI and dev hook | The first two row 2 escapes pass here too: a reviewer that only a dispatch line names, and a tracked `.claude/agents/<name>.md` copy. The harness ignores the field for plugin agents, so the check pins the declaration, not behavior |
| 4 | `security-reviewer` stays on `opus` | `AGENTS.md` "Agents (13)", `docs/architecture.md` "Model tiering" | both (partial) | `security-reviewer-model`. CI and dev hook | A tracked `.claude/agents/security-reviewer.md` copy shadows the declared `model` and passes. User-side overrides, an untracked copy or `CLAUDE_CODE_SUBAGENT_MODEL`, live outside this repo |
| 5 | A reviewer's shell mutation is detected | `docs/architecture.md` "Checks and balances" | both (partial) | `tree-check.sh`, tested by `tests/team-code-review-tree-check.test.mjs`. Skill prose calls it | The orchestrator must call it. A write that changes no `git status` line passes (`tree-check.sh` header). Examples are a write to an ignored path, such as `docs/plans/` in this repo, and a rewrite of an untracked file the status already lists |
| 6 | Nested helpers stay read-only, one level deep, at most 4 in flight | `agent-dispatch.md` "Dispatch invariants" | prose-only | None | Not mechanizable: runtime dispatch behavior, and the plugin ships no runtime hooks. A `general-purpose` skeptic holds `Write`, and only its prompt keeps it read-only. Row 5 detects a write after a reviewer dispatch when the write changes `git status` |
| 7 | The design reviewer runs as `Explore` | `08-design-review-gate-design.md` step 3 | prose-only | None | Not mechanizable: the dispatch parameter is a runtime tool call |
| 8 | The cross-model vendor path writes nothing | `docs/architecture.md` "Checks and balances" | prose-only | None | Not mechanizable: vendor CLIs run outside harness tool grants. A prose `git status` step reports a write (`cross-model-review.md`) |
| 9 | Research isolation | `docs/architecture.md` "1. Design philosophy", `02-setup.md`, `14-rules.md` | prose-only | None | Not mechanizable: it needs a runtime read or dispatch hook, and the researcher needs `Read` |
| 10 | Each artifact carries `topic`, `date`, and a `phase` from the fixed set. Design carries `revision` | `artifacts.md` "Frontmatter schema" | both (partial) | `render-research.mjs` writes the `5-research.md` frontmatter by construction. It and `record-design-review.mjs` refuse a source artifact with no `topic`. Both are tested by `tests/team-artifact-scripts.test.mjs`. Skill prose calls them | Deferred for agent-written artifacts: they are uncommitted runtime state, so CI never sees them. The PRD lists a frontmatter schema as future scope |
| 11 | All artifacts in one directory carry the same topic | `artifacts.md` "Topic invariant" | both (partial) | `render-research.mjs`, `record-design-review.mjs`, and `append-cross-model-notes.mjs` copy the topic by construction, tested by `tests/team-artifact-scripts.test.mjs`. Skill prose calls them | Deferred for agent-written artifacts, for the row 10 reason |
| 12 | `ticketId`, `route`, and `routeStatus` appear only on `1-task.md` | `artifacts.md` "Frontmatter schema" | both (partial) | The three row 11 scripts write frontmatter by construction, with none of the three keys. Tested by `tests/team-artifact-scripts.test.mjs`. Skill prose calls them | Deferred for agent-written artifacts, for the row 10 reason |
| 13 | `<id>` and topic format | `artifacts.md` "Artifact inventory" | both | `plan-id.sh`, tested by `tests/team-plan-id.test.mjs`. Skill prose calls it | The orchestrator must call it |
| 14 | Design review passes only on the highest-round APPROVE or COMMENT | `artifacts.md` "Review records" | both | `design-review-status.sh` and `record-design-review.mjs`, both tested. Skill prose calls them | The orchestrator must call them |
| 15 | A review record is never overwritten | `artifacts.md` "Review records" | both (partial) | `record-design-review.mjs` writes with flag `wx`, tested by `tests/team-artifact-scripts.test.mjs`. Skill prose calls it | The session writes `review-<n>.md` and `security-review-<n>.md` with the Write tool, so an overwrite of either passes. Deferred: it needs a runtime writer script, with the row 16 work |
| 16 | `review-<n>.md` and `security-review-<n>.md` schema and malformed rules | `artifacts.md` "Review records" | prose-only | None | Deferred: it needs a runtime status script and call-site edits in four skills |
| 17 | Reviewers and the implementer never read a review record | `artifacts.md` "Review records" | prose-only | None | Not mechanizable: a runtime read |
| 18 | Never restore the `^approved:` gate | `artifacts.md` "Review records" | prose-only | None | Not mechanizable under `AGENTS.md` "Test executable code, not skill Markdown": the only check is a scan of skill text |
| 19 | No runtime hooks ship | `AGENTS.md` "Hooks", `docs/architecture.md` "7. Hooks" | prose-only | None | Deferred: no regression since the 0.131.0 removal, and a check needs each host's hook-registration format |
| 20 | A version bump happens only with a runtime change | `AGENTS.md` "Learned rules", `docs/versioning.md` | both (partial) | `version-bump-required.sh` through `pre-merge-guard.mjs`, on a literal `gh pr merge` in a Claude Code session | A merge through any other surface, such as the GitHub UI, runs no check. No GitHub setting closes that gap, because a CI check would be red for a runtime PR's whole review (`docs/versioning.md` "What CI enforces, and where") |
| 21 | A drafted PR carries no version | `AGENTS.md` "Learned rules" | both (partial) | Row 20's guard denies a stale early bump at the merge attempt | An early bump looks like a correct bump until `main` moves. A merge through another surface runs no check, as in row 20 |
| 22 | Six version strings agree, and the host manifests agree on names and description | `docs/versioning.md` "What CI enforces, and where" | mechanical | `check-version-consistency.sh`, tested by `tests/check-version-consistency.test.mjs`. CI and the `version-bump` land step | None |
| 23 | A release tag is signed, its version is semver, and its changelog section has content | `docs/versioning.md` "Release on merge" | mechanical | `release-on-merge.yml` on every push to `main`, tested by `tests/release-tag-signing.test.mjs` | A tag pushed by hand runs no check. Tag protection, a GitHub setting, closes that gap |
| 24 | A bug fix never commits to the default branch | `skills/team-fix/references/05-worktree.md`, `07-ship.md` | both | `branch-gate.sh`, tested by `tests/team-fix-branch-gate.test.mjs`. Skill prose calls it | The orchestrator must call it |
| 25 | The plugin test suite passes | `AGENTS.md` "Cursor Cloud specific instructions" | mechanical | `node --test tests/*.test.mjs`. CI | None |
| 26 | The diff has no whitespace errors or conflict markers | same, plus `CONTRIBUTING.md` "Making a change" | mechanical | `git diff --check` over the PR range. CI | None |
| 27 | Tests never assert skill or agent Markdown | `AGENTS.md` "Learned rules" | prose-only | None | Not mechanizable: a check would have to judge what a test asserts. Code review owns it |
| 28 | No `commands/` directory | `AGENTS.md` "Learned rules" | prose-only | None | Deferred: a path-absence test is cheap, but no regression is recorded |
| 29 | No project-scoped memory | `AGENTS.md` "Learned rules" | prose-only | None | Not mechanizable here: the files live under `~/.claude/`, outside the repo |
| 30 | Todo-first progress tracking | `AGENTS.md` "Learned rules", `execution.md` | prose-only | None | Not mechanizable: agent behavior, which the PRD's future eval suite owns |
| 31 | No mid-run human gates, and subagents never pause for input | `docs/architecture.md` "1. Design philosophy", `14-rules.md` | prose-only | None | Not mechanizable: agent behavior |
| 32 | New tests fail by assertion, not by crash | `registry.json` `gates`, `11-mechanical-gate-test-confirmation.md` | prose-only | None | Not mechanizable in the plugin: the target repo's test framework varies |
| 33 | Agent frontmatter uses only Claude Code's supported fields | `AGENTS.md` "Agents (13)" | prose-only | None | Deferred: it needs a pinned copy of an external field list that changes with Claude Code releases |
