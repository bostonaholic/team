# Behavioral Evals

Behavioral regression harness for the Team pipeline agents and skills.

This directory holds fixtures, rubrics, and stored runs. The harness code
(TypeScript + Bun) lives in `tests/`. Two tiers:

- **Static gate** (`bun run test:gate`) — free, runs on every PR. Loads each
  agent/skill fixture, applies the rubric's structural assertions, no API
  calls.
- **E2E + LLM-judge** (`bun run test:periodic`) — paid, nightly + manual.
  Runs the agent end-to-end and scores output with an LLM judge. Requires
  `EVALS_ANTHROPIC_API_KEY`.

See `tests/` for the harness implementation and `evals/*/` for fixtures.

## Coverage

Coverage spans all 13 agents (12 new + code-reviewer) and 28 skills. Every
agent and skill has a fixture.

## Skill harness

The skill harness loads each `SKILL.md`, extracts its rubric block, and
asserts the documented structure is present. See `tests/skills.test.ts`.

## Gate runner

The gate runner (`bun scripts/run-gate-evals.ts`) aggregates every gate
case and exits non-zero on the first rubric failure. CI invokes it via
`bun run test:gate`.

## Tier reference

- Static gate: `bun run test:gate` (free, no API calls).
- Paid E2E + LLM-judge: `bun run test:periodic` (needs
  `EVALS_ANTHROPIC_API_KEY`).
