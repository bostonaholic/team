---
topic: red-green-refactor-tdd
date: 2026-05-22
phase: questions
---

# Research Questions: red-green-refactor-tdd

## Codebase context

- Scope: `agents/`, `skills/team/`, `skills/team-implement/`, `skills/test-first-development/`, `skills/refactoring-to-patterns/`
- Vocabulary:
  - *agent* — a Markdown file in `agents/` with YAML frontmatter (`name`, `description`, `model`, `tools`, `permissionMode`) that defines a specialist's instructions
  - *phase table* — the authoritative dispatch table in `skills/team/SKILL.md` mapping phase names to agent(s), predecessor artifacts, and gate types
  - *registry* — `skills/team/registry.json`, an inventory of all agents tagged by phase; must stay in sync with `agents/` frontmatter
  - *mechanical gate* — a gate type where the orchestrator runs a command (e.g., test suite) and checks exit conditions before advancing
  - *aggregate gate* — a gate where 5 parallel reviewers each return a verdict; hard gates on security, verification, and code-review results
  - *slice* — a vertical end-to-end unit of work from `structure.md`; slices are executed sequentially with atomic commits

## Topology

1. In `skills/team/SKILL.md`, what agents are listed under the IMPLEMENT phase in the phase table, in what order are they dispatched, and what predecessor artifact does the phase require?

2. In `skills/team-implement/SKILL.md`, what are the named sub-steps of the IMPLEMENT phase, and which agent is responsible for each sub-step?

3. In `agents/test-architect.md`, what are the agent's declared responsibilities, what files does it read, and what constitutes its completion signal to the orchestrator?

4. In `agents/implementer.md`, which responsibilities does the agent describe for itself during a normal (non-fix) dispatch — specifically, what activities does it perform within each slice before committing?

5. What gates exist inside the IMPLEMENT phase (not just at the phase boundary) — specifically, what condition must hold between `test-architect` finishing and `implementer` starting, and what condition must hold after `implementer` finishes before the 5 reviewers are dispatched?

## Conventions

6. How are new agents introduced into the pipeline? What files must be created or updated when a new agent is added, and what invariant does `.claude/hooks/check-registry-sync.mjs` enforce?

7. What frontmatter fields are required on every agent file in `agents/`? What values are legal for `model` and `permissionMode`?

8. How does the `implementer` agent handle refactoring today — does it perform refactoring within a slice's green pass, in a separate commit, or not at all? Cite the specific section of `agents/implementer.md` and any referenced skill.

9. What does `skills/test-first-development/SKILL.md` say about the distinction between feature-level acceptance tests (scope fence) and step-level TDD cycles — specifically, how does it describe the red-green-refactor loop and who owns it?

10. What does `skills/refactoring-to-patterns/SKILL.md` specify about when refactoring is permitted relative to test state, and what commit discipline does it require for refactoring steps?

## Constraints

11. What types, schemas, or interfaces does `skills/team/registry.json` impose on agent entries? What fields are required in each agent object, and what values are legal for `phase` and `parallel`?

12. In `skills/team/SKILL.md`, what rule governs adding a new agent to the pipeline — specifically, which two files must be updated atomically?

13. What does the mechanical gate after `test-architect` check, and where is that gate logic defined (orchestrator skill vs. agent vs. both)? What happens if the condition is not met?

14. What is the maximum number of fix-and-re-review rounds the aggregate gate allows, and where is that cap defined?

## Reference points

15. What is the most structurally similar existing agent-split in the pipeline — a phase where two agents run in a defined sequence with a gate between them — and where are those agent files and the skill that coordinates them?
