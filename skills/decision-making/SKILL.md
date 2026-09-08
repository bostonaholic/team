---
name: decision-making
description: 'Makes decisions by classifying reversibility and risk, choosing two-way doors quickly, and scoring one-way doors. Trigger on "make a decision", "compare options", or "/decision-making".'
effort: high
argument-hint: "[<decision, context, and optional options>]"
---

# Decision Making

Use the least process that the decision needs. Reversibility and risk determine
the rigor. Make low-risk, reversible decisions quickly. Apply a weighted
comparison to consequential decisions.

## Input

Use `$ARGUMENTS` and the conversation to identify the decision and its context.
Capture the desired outcome, decision owner, deadline, hard constraints,
stakeholders, risk tolerance, and known options. If the user supplies no
options, generate the smallest credible set. Include the status quo only when it
is viable.

Ask only when a missing fact can change the door classification or invalidate
every available option. State other assumptions and continue.

## Framework

1. **Frame the decision.** State the choice and desired outcome in one sentence.
   Separate hard constraints from preferences. Mark any option that fails a
   hard constraint as ineligible.
2. **Classify the decision before comparing options.**
   - A **two-way door** lets the decision owner reverse or change the choice
     within acceptable time and cost. Its consequences stay contained during
     reversal.
   - A **one-way door** is impossible, slow, or expensive to reverse. A decision
     is also one-way when it can cause material legal, financial, safety, data,
     operational, or external harm before reversal.
   - Estimate risk as likelihood multiplied by impact. Treat uncertain
     reversibility or material risk as a one-way door.
3. **Use the matching path.** Do not apply one-way-door rigor to a two-way door.

## Two-Way Door

Choose the best available option from the context and state one short reason.
Do not create a heuristic, scorecard, research task, or sensitivity analysis.
Do not ask for more information unless it can change the classification. When
the user authorized execution, continue with the choice without another
confirmation.

## One-Way Door: Compare Options

1. **Define the heuristic before evaluating any option.** Choose 3–7 independent
   criteria tied to the desired outcome. Always include Reversibility and Risk.
   Give them the two largest weights. Each must outweigh every other criterion,
   and together they must exceed 50. Weights total 100.
2. **Define the scoring contract.** For each criterion, state its measurement,
   evidence source, and 0–5 anchors. A higher Reversibility score means easier
   reversal. A higher Risk score means lower likelihood and impact of harm.
3. **Gather enough evidence to decide.** Prefer measured facts and authoritative
   sources. Stop research when more evidence cannot change the leading eligible
   option or its risk classification.
4. **Score every option against every criterion.** Apply the same anchors and
   evidence standard to all options. Show evidence or calculations beside each
   score. Use a defensible range for unknown values and name the missing fact.
5. **Calculate the result.** Multiply each weight by its score divided by 5,
   then sum the results. A ranged criterion produces a ranged total. Keep full
   scores visible for options that fail a hard constraint, but mark them
   ineligible.
6. **Test sensitivity.** State if reasonable changes to weights or unknown
   values can change the leader. Treat overlapping totals as uncertain.
7. **Decide.** Choose the highest-scoring eligible option. Connect the deciding
   criteria to the context. State the assumptions and facts that can reopen the
   decision. Do not overrule the scorecard with a new criterion in prose.

## Output

For a two-way door, give the choice and one short reason. Then continue or stop
as the request requires.

For a one-way door, use this order:

1. **Decision context:** outcome, constraints, options, classification, and
   assumptions.
2. **Heuristic:** criterion, measurement, anchors, and weight.
3. **Scorecard:** every option, evidence, hard-constraint status, weighted total
   or range, and rank.
4. **Decision:** one choice, deciding results, sensitivity, confidence, facts
   that can reopen the decision, and the next action.

## Rules

- Distinguish observed facts, estimates, and assumptions.
- Keep criteria independent. Avoid undefined labels such as "best" or "easy."
- If a new criterion appears after scoring, restart and rescore every option.
- Use ranges instead of false precision. Explain material ties.
