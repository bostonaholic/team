---
topic: agent-behavioral-evals
date: 2026-05-28
phase: questions
---

# Research Questions: agent-behavioral-evals

## Codebase context

- Scope: `agents/`, `skills/`, `hooks/`, `tests/`, `package.json`,
  `.claude/hooks/`, `.claude/scripts/`
- Vocabulary:
  - *Agent file* — a Markdown file under `agents/` with YAML frontmatter
    (`name`, `model`, `tools`, `skills`, `permissionMode`).
  - *Skill* — a `SKILL.md` file under `skills/<name>/` loaded by agents
    or registered as a slash command.
  - *Artifact directory* — `docs/plans/<id>/` containing phase artifacts
    with YAML frontmatter.
  - *Gate tier* — a check that blocks a PR (currently all tests in
    `tests/*.sh`).
  - *Registry* — `skills/team/registry.json`, the canonical list of 13
    agents and their phases.

## Topology

1. What test runner and conventions do the existing tests in `tests/`
   use — bash, bun, or something else — and how are they invoked (by
   what command, from what working directory)?

2. What is the complete list of agent files under `agents/`, what model
   is each configured for, and which agents are tagged as `parallel: true`
   in `skills/team/registry.json`?

3. What do the existing tests in `tests/*.sh` assert about agent files
   and skill files — do they read agent content, inspect frontmatter,
   or only check file existence and string patterns?

4. Does `package.json` define any `scripts` entries (test, lint, build)?
   If not, how are the `tests/*.sh` scripts currently wired into CI?

5. Is there a CI configuration file (`.github/workflows/`, `.circleci/`,
   etc.) in this repo, and if so, what commands does it run and on what
   triggers?

## Conventions

6. What naming convention and directory convention do the files under
   `tests/` follow (file suffix, prefix pattern, naming relation to the
   feature being tested)?

7. What shell patterns appear repeatedly across `tests/*.sh` — how is
   `pass()`/`fail()` structured, how are `FAILURES` accumulated, and how
   does the script exit?

8. How does `.claude/hooks/check-registry-sync.mjs` (the dev-only hook)
   structure its assertions — does it check agent file content, JSON
   schema, or cross-file consistency, and what does it emit on failure?

## Constraints

9. What fields are required in agent frontmatter (enforced by
   `hooks/post-write-validate.mjs` or documented in `CLAUDE.md`/
   `docs/architecture.md`), and are there any fields that are optional
   versus mandatory?

10. What does `hooks/post-write-validate.mjs` validate for files under
    `agents/`, `skills/`, `hooks/`, and `.claude-plugin/` — specifically,
    what structural rules would a new file in a new `evals/` directory
    need to satisfy (if any)?

11. Are there any abstractions or utilities shared across `tests/*.sh`
    files — sourced helper libraries, common setup/teardown patterns, or
    env variable conventions?

## Reference points

12. Which existing test in `tests/` is the most representative example
    of testing behavioral content inside an agent or skill file (as opposed
    to checking file existence), and what is its structure?

13. In `skills/team/registry.json`, which phases and agents are listed as
    highest-priority (earliest in the phase table), and what artifact paths
    do those phases consume and produce?
