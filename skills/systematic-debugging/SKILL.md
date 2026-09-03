---
name: systematic-debugging
description: Diagnose non-obvious failures from reproduction through evidenced root cause.
user-invocable: false
---

# Systematic Debugging

## Input

Start from the observed failure, not a proposed fix.

## 4-Phase Investigation

> Follow `skills/principle-progress-tracking/SKILL.md`: seed one todo per
> phase and mark it complete as you go.

### Phase 1: OBSERVE

- **Reproduce the failure** and record exact inputs and steps.
- Read complete errors, traces, logs, runtime state, timestamps, recent
  changes, and the boundary between working and failing behavior.
- Treat intermittency as evidence. Measure its rate, environments,
  concurrency, and shared state.
- Use `skills/why/SKILL.md` when the question becomes why deliberate code
  exists.

Do not hypothesize yet.

### Phase 2: HYPOTHESIZE

List at least two causes that explain all observations. Rank common config and
environment causes before exotic code causes. State a falsifiable prediction
for each.

### Phase 3: TEST

Run discriminating experiments that eliminate hypotheses. Change one variable,
record expected and actual results, and do not revive a disproved cause without
new evidence. Bisect when a passing baseline and failing revision bound the
change.

### Phase 4: CONCLUDE

Identify and fix the root, not its proximate symptom, per
`skills/principle-fix-root-causes/SKILL.md`. Re-run the original
reproduction and regression suite. Search for sibling instances and record
what the experiments ruled out.

#### Root Cause Analysis (5 Whys)

Ask why from the proximate cause until every causal branch ends at a cause you
can change. Ground every link in OBSERVE evidence; return to OBSERVE when a
link lacks evidence. Five is not a quota. Stop before causes outside your
control. Fix the root link.

## Escalation Rules

After three eliminated hypotheses, widen scope to adjacent systems,
environment differences, interactions, and the reliability of prior evidence.
Escalate only after reasonable hypotheses are exhausted, a reliable
reproduction cannot be established, or the needed environment, configuration,
dependency, or external system cannot be inspected. Report observations,
hypotheses, experiments, eliminated causes, and remaining possibilities.

## Output

Report observations, hypotheses, experiments, eliminated causes, the evidenced
root cause, and remaining next steps. Never return only “I do not know.”
