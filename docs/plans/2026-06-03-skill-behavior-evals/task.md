---
topic: skill-behavior-evals
date: 2026-06-03
phase: task
ticketId: null
---

# Task: skill-behavior-evals

## Description
Review TESTING.md and write the remaining behavioral evals tests for all
skills that currently lack them. The code-reviewer skill is the only one
with a behavioral eval today (`tests/code-reviewer.evals.ts` + fixtures
under `evals/fixtures/code-reviewer/`). The existing implementation should
not be blindly copied — if it deviates from TESTING.md, fix it first, then
use TESTING.md as the source of truth for all new work. Write evals for
every skill that has testable behavioral properties at L5/L6.

## Stated goal
Cover all pipeline skills with behavioral evals that comply with the
six-layer harness described in TESTING.md.

## Inferred goal
Establish a repeatable, cost-efficient eval regression harness so that any
future change to a skill's prompt or logic is caught automatically — not by
manual smoke-testing — before it ships to users.

## Acceptance signals
- `tests/code-reviewer.evals.ts` (and any existing eval file) complies with
  TESTING.md's layer classification and file-naming conventions.
- Every skill that has a testable behavioral property has at least one
  fixture under `evals/fixtures/<skill>/`, a rubric under
  `evals/rubrics/<skill>.md`, and an eval file at
  `tests/<skill>.evals.ts`.
- `bun test` (free tier) continues to pass — no paid calls leak into L1–L4.
- `tests/static-gate.test.ts` passes: every fixture loads, every rubric
  exists, no dangling entries.
- `tests/helpers/touchfiles.ts` registers diff-based touchfiles for every
  new eval so selection works correctly.
- The eval suite is classifiable as gate or periodic per TESTING.md §4.

## Open assumptions
- Skills without a stateless, input→output behavioral contract (e.g. pure
  methodology lenses such as `product-thinking`, `engineering-standards`,
  `solid-principles`) may not need L5 evals — they are already covered by
  L2 tripwires in `tests/methodology.test.ts` and `tests/architecture.test.ts`.
- The scope is the 29 skills under `skills/`; the 13 agents are in scope
  only insofar as they are the subject of existing evals (code-reviewer).
- Adding evals for every skill in one PR may be too large; slicing by skill
  category is acceptable if each slice is independently mergeable.
