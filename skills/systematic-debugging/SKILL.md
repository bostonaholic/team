---
name: systematic-debugging
description: 'Defines systematic debugging methodology. Load when agents need its procedure.'
user-invocable: false
---

# Systematic Debugging

Find the cause before fixing. Read
[references/investigation.md](references/investigation.md) for the full evidence
checklist, 5 Whys method, examples, and escalation payload.

## Phase 1: OBSERVE

- Read complete errors and stack traces.
- Reproduce the failure and record exact steps.
- Gather logs, runtime state, timestamps, sequence, recent code/deploy/config
  changes, multiple samples, and what still works.
- Treat intermittency as evidence. Measure failure rate and environment
  variance; inspect timing, concurrency, resources, and shared state.
- When the question becomes why deliberate code exists, load
  `skills/why/SKILL.md`.

Do not hypothesize during OBSERVE.

## Phase 2: HYPOTHESIZE

List at least two explanations. Rank common, configuration, environment, then
code causes. Each theory must explain all failures and working neighbors. State
predictions that can prove it wrong.

## Phase 3: TEST

- Run a discriminating experiment that eliminates a hypothesis under either
  outcome. Change one variable.
- Record expected and actual results immediately. Keep disproved theories
  closed unless new evidence appears.
- With a working baseline and failing tip, use `git bisect`. Apply the same
  binary search to config, dependency, or feature-flag ranges.

## Phase 4: CONCLUDE

- Identify the root cause, not the proximate symptom
  (`principle-fix-root-causes`).
- Make the original reproduction pass without changing unrelated behavior.
- Search for related instances and document evidence and eliminated theories.

### Root Cause Analysis (5 Whys)

Ask why from symptom to a cause you can change. Evidence must support every
link; branch when multiple causes exist. Stop at an external constraint. The
chain can contain one link; five is not a quota. Fix the root link. The
`test-driven-bug-fix` mutation check proves the regression test depends on the
fix. Blame process, not people.

## Escalation Rules

After 3 failed hypotheses, widen to adjacent systems, environment differences,
questioned evidence, and component interactions.

Escalate to the user only after plausible hypotheses are exhausted, required
environment is inaccessible, reproduction remains unreliable, or the cause is
external. Give observed evidence, tested hypotheses, eliminated explanations,
and remaining possibilities. Never return only “I do not know.”
