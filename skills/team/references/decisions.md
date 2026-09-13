# Decisions

Read before resolving a consequential choice or recording an architecture decision.

## Autonomous decisions

During autonomous work, resolve genuine choices with the recommended option and record each in the governing artifact.
Use `Assumption — chosen without user review`. Name the rejected alternative and accepted trade-off.
Resolve helper ambiguity yourself or record it in the artifact's open questions. Never delegate asking the user.
Record low-stakes deferrals as deferred open questions. Report the artifact's assumption count.

## Decision method

Match effort to reversibility and risk. Make low-risk, reversible choices quickly; apply a weighted comparison to consequential ones.

Classify before comparing options:

- A **two-way door** reverses within acceptable time and cost and its consequences stay contained during reversal. Choose the best option and return it with one short reason. Do not build a scorecard or research task.
- A **one-way door** is impossible, slow, or expensive to reverse, or can cause material legal, financial, safety, data, operational, or external harm before reversal. Treat uncertain reversibility or material risk as a one-way door.

For a one-way door, define the heuristic before evaluating any option: 3–7 independent criteria tied to the desired outcome, always including Reversibility and Risk with the two largest weights (together over 50 of 100). State each criterion's measurement, evidence source, and 0–5 anchors. Score every option against every criterion with evidence, multiply each weight by its score divided by 5 and sum, test sensitivity, then choose the highest-scoring eligible option. Return the context, heuristic, scorecard, deciding result, sensitivity, confidence, assumptions, facts that can reopen the decision, and next action.

Distinguish observed facts, estimates, and assumptions. Keep criteria independent. Restart and rescore when a new criterion appears after scoring. Use ranges instead of false precision.

## Architecture decision records

Write an ADR when choosing among alternatives, accepting an important trade-off, breaking an established convention, or adding a long-lived dependency. Skip obvious choices, established patterns, minor implementation details, and choices reversible in minutes.

```markdown
# NNNN. Decision Title

## Status
Proposed | Accepted | Deprecated | Superseded by [NNNN](NNNN-title.md)

## Context
<Objective facts: problem, technical/business constraints, team capability, and timeline.>

## Decision
<Active-voice decision: "We will…", never "It was decided that…".>

## Consequences
<What becomes easier and harder; include positive and negative trade-offs.>
```

Store ADRs under `docs/decisions/` with zero-padded sequence names (`0001-use-typescript-for-plugin.md`). Read existing files, increment the highest number, or start at `0001` when absent. Status rules: Proposed is open for discussion; Accepted is in effect and code must conform; Deprecated is retained after its subject disappears; Superseded links the successor, which names the prior ADR in Context so navigation works both ways. State specific facts and rejected alternatives; record incomplete information; keep it readable in under five minutes.
