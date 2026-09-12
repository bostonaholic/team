---
name: decision-making
description: 'Defines a decision method based on reversibility and risk. Load when choosing among viable options or resolving a consequential trade-off.'
user-invocable: false
---

# Decision Making

Match decision effort to reversibility and risk. Make low-risk, reversible
decisions quickly. Apply a weighted comparison to consequential decisions.

## Context

Use the decision and context supplied by the caller. Capture the desired
outcome, decision owner, deadline, hard constraints, stakeholders, risk
tolerance, and known options. Generate the smallest credible option set when
needed. Include the status quo only when viable.

Ask only when a missing fact can change the door classification or invalidate
every option. State other assumptions and continue.

## Framework

1. **Frame the decision.** State the choice and desired outcome in one sentence.
   Separate hard constraints from preferences. Mark an option that fails a hard
   constraint as ineligible.
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

Choose the best available option and return it with one short reason. Do not
create a heuristic, scorecard, research task, or sensitivity analysis. Do not
ask for more information unless it can change the classification. Continue
with authorized execution without another confirmation.

## One-Way Door

1. **Define the heuristic before evaluating any option.** Choose 3–7 independent
   criteria tied to the desired outcome. Always include Reversibility and Risk.
   Give them the two largest weights. Each must outweigh every other criterion,
   and together they must exceed 50. Weights total 100.
2. **Define the scoring contract.** For each criterion, state its measurement,
   evidence source, and 0–5 anchors. Higher Reversibility means easier reversal.
   Higher Risk means lower likelihood and impact of harm.
3. **Gather enough evidence to decide.** Prefer measured facts and authoritative
   sources. Stop when more evidence cannot change the leading eligible option
   or its risk classification.
4. **Score every option against every criterion.** Apply the same anchors and
   evidence standard to all options. Show evidence or calculations beside each
   score. Use a defensible range for unknown values and name the missing fact.
5. **Calculate the result.** Multiply each weight by its score divided by 5,
   then sum the results. A ranged criterion produces a ranged total. Keep full
   scores for options that fail a hard constraint, but mark them ineligible.
6. **Test sensitivity.** State if reasonable weight or value changes can change
   the leader. Treat overlapping totals as uncertain.
7. **Decide.** When the caller names a decision owner other than itself,
   return the framed choice, the options, and the classification. Do not
   pick. Otherwise, choose the highest-scoring eligible option and return the
   context, heuristic, scorecard, deciding results, sensitivity, confidence,
   assumptions, facts that can reopen the decision, and next action.

## Rules

- Distinguish observed facts, estimates, and assumptions.
- Keep criteria independent. Avoid undefined labels such as "best" or "easy."
- If a new criterion appears after scoring, restart and rescore every option.
- Use ranges instead of false precision. Explain material ties.
- When the caller names a decision owner other than itself and the decision
  classifies as a one-way door, return the framed choice, the options, and
  the classification. Do not pick. Two-way doors keep today's fast pick, so
  ordinary triage is unaffected.
