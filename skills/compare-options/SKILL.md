---
name: compare-options
description: 'Compares options with a context-specific weighted heuristic and recommends one from the evidence. Trigger on "compare these options", "which should I choose", or "/compare-options".'
effort: high
argument-hint: "[<decision, options, and context>]"
---

# Compare Options

Use one decision heuristic across every option. Define it before scoring so
the results cannot determine the criteria.

## Input

Use `$ARGUMENTS` and the current conversation to identify the options and the
decision context. Capture the goal, hard constraints, stakeholders, time
horizon, reversibility, and risk tolerance. Ask only when a missing fact would
materially change the heuristic; otherwise state the assumption.

## Procedure

1. **Frame the decision.** State the choice, options, context, and success
   condition. Separate hard constraints from preferences.
2. **Define the heuristic before evaluating any option.** Choose 3–7
   independent criteria tied to the success condition. For each criterion,
   define the measurement, evidence source, 0–5 score anchors, and weight.
   Weights total 100. Avoid overlapping criteria and undefined labels such as
   "best" or "easy."
3. **Score every option against every criterion.** Apply the same anchors and
   evidence standard to all options. Show the evidence or calculation beside
   each score. When evidence is unavailable, use the defensible score range
   instead of inventing a point value, and name the missing fact.
4. **Calculate the result.** For each criterion, multiply its weight by the
   score divided by 5, then sum the results. A ranged criterion produces a
   ranged total. Mark hard-constraint failures, but keep their complete scores
   visible.
5. **Test sensitivity.** State whether reasonable changes to weights or unknown
   values can change the leader. Treat an overlapping or easily reversed result
   as uncertain.
6. **Recommend one option.** Choose the highest-scoring eligible option and
   connect the deciding criteria to the stated context. If an omitted context
   factor changes the recommendation, add it to the heuristic and rescore; do
   not overrule the scorecard with new narrative reasoning.

## Output

Use this order:

1. **Decision context:** goal, constraints, and stated assumptions.
2. **Heuristic:** a table with criterion, measurement, anchors, and weight.
3. **Scorecard:** a table scoring every option on every criterion, with brief
   evidence, hard-constraint status, weighted total or range, and rank.
4. **Recommendation:** one choice, the deciding results, sensitivity, confidence,
   and the facts that would change the recommendation.

## Rules

- Prefer measured facts and authoritative sources over impressions.
- Distinguish observed facts, estimates, and assumptions.
- Do not change criteria, anchors, or weights after scoring unless you disclose
  the reason, restart the comparison, and rescore every option.
- Do not hide uncertainty behind false precision. Use ranges where inputs are
  uncertain and explain material ties.
