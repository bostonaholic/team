---
name: compare-options
description: 'Classifies choices as one-way or two-way doors, then scores only consequential options. Trigger on "compare these options", "which should I choose", or "/compare-options".'
effort: high
argument-hint: "[<decision, options, and context>]"
---

# Compare Options

Match decision effort to reversibility and risk. Make low-risk, reversible
choices quickly. Apply full comparison rigor to consequential choices.

## Input

Use `$ARGUMENTS` and the current conversation to identify the options and the
decision context. Capture the goal, hard constraints, stakeholders, time
horizon, reversibility, and risk tolerance. Ask only when a missing fact could
change the door classification; otherwise state the assumption.

## Decision Gate

1. **Classify the decision before comparing options.**
   - A **two-way door** is reversible within acceptable time and cost, with
     contained consequences and low downside.
   - A **one-way door** is impossible, slow, or expensive to reverse, or it can
     cause material legal, financial, safety, data, operational, or external
     harm.
   - Estimate risk as likelihood multiplied by impact. If reversibility or risk
     is uncertain, treat the decision as a one-way door.
2. **For a two-way door, decide and move on.** Choose the best available option,
   state the choice and one short reason, then stop. Do not create a heuristic,
   scorecard, or sensitivity analysis unless the user explicitly requests one.
   Do not ask for more information unless it could change the classification.
3. **For a one-way door, use the full procedure below.**

## One-Way Door Procedure

1. **Frame the decision.** State the choice, options, context, and success
   condition. Separate hard constraints from preferences.
2. **Define the heuristic before evaluating any option.** Choose 3–7
   independent criteria tied to the success condition. For each criterion,
   define the measurement, evidence source, 0–5 score anchors, and weight.
   Always include Reversibility and Risk. Give them the two largest weights;
   each must outweigh every other criterion, and together they must exceed 50.
   Score higher reversibility as better. Score lower likelihood and impact of
   harm as better. Weights total 100. Avoid overlapping criteria and undefined
   labels such as "best" or "easy."
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

For a two-way door, give the choice and one short reason, then stop.

For a one-way door, use this order:

1. **Decision context:** goal, constraints, door classification, and stated
   assumptions.
2. **Heuristic:** a table with criterion, measurement, anchors, and weight.
3. **Scorecard:** a table scoring every option on every criterion, with brief
   evidence, hard-constraint status, weighted total or range, and rank.
4. **Recommendation:** one choice, the deciding results, sensitivity, confidence,
   and the facts that would change the recommendation.

## Rules

- Prefer measured facts and authoritative sources over impressions.
- Distinguish observed facts, estimates, and assumptions.
- Never use the one-way-door procedure merely to justify delaying a two-way-door
  decision.
- Do not change criteria, anchors, or weights after scoring unless you disclose
  the reason, restart the comparison, and rescore every option.
- Do not hide uncertainty behind false precision. Use ranges where inputs are
  uncertain and explain material ties.
