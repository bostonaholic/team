# Research: Auto-Revise Plan on Critical/Major Critique Findings

## Summary

Implement an auto-revision loop in the router's plan gate handling. When `plan.critiqued` contains critical or major findings, automatically emit `plan.revision-requested` instead of presenting to the user. The planner revises, the critic re-reviews, and the cycle repeats up to 3 times before escalating to the user.

## Key Files

### Must Modify
- `skills/team/SKILL.md` — Router skill, lines 100-118 (Human Gate section). This is where auto-revision logic replaces immediate user presentation.

### Reference Only (No Changes)
- `skills/team/registry.json` — Gate stays as `"human"` type. Auto-revision is prose-driven (same pattern as interview gate).
- `agents/plan-critic.md` — Produces verdict: PASS / PASS WITH CHANGES / REVISE with structured `issues` array.
- `agents/planner.md` — Already consumes `plan.revision-requested`. Re-runs plan creation from research artifacts.
- `lib/events.mjs` — `EVENT_TO_PHASE` map. `plan.critiqued` is absent; could add `"PLAN"` mapping.
- `docs/event-catalog.md` — Canonical event payloads.
- `teamflow/src/state.ts` — Dashboard state engine.

## Current Flow

```
plan.drafted → plan-critic → plan.critiqued → [human gate] → plan.approved/plan.revision-requested
```

The human gate (SKILL.md lines 100-118):
1. Read plan artifact + critique from event data
2. Filter display based on verdict (PASS / PASS WITH CHANGES / REVISE)
3. Ask user "Do you approve this plan?"
4. Approved → `plan.approved` | Rejected → `plan.revision-requested`

## Target Flow

```
plan.drafted → plan-critic → plan.critiqued
  ├─ if verdict == REVISE (critical/major findings):
  │    → auto-emit plan.revision-requested (with critique as feedback)
  │    → planner consumes, produces revised plan.drafted
  │    → plan-critic re-reviews (loop)
  ├─ if verdict == PASS or PASS WITH CHANGES:
  │    → [human gate] → plan.approved
  └─ safety valve: max 3 revision cycles → escalate to user
```

## Event Payloads

### `plan.critiqued` (from event-catalog.md)
```json
{
  "verdict": "PASS | PASS WITH CHANGES | REVISE",
  "issues": [
    { "severity": "critical | major | minor | nitpick", "description": "...", "suggestion": "..." }
  ],
  "planPath": "string"
}
```

### `plan.revision-requested` (from event-catalog.md)
```json
{
  "planPath": "string",
  "feedback": "string",
  "revisionNumber": "integer"
}
```

## Design Decisions

1. **Gate type stays `"human"`** — Auto-revision logic lives in SKILL.md prose, matching the interview gate pattern. No registry changes needed.
2. **`feedback` field carries critique findings** — For auto-revision, router extracts feedback from the critic's `### CRITICAL` and `### MAJOR` markdown sections (the critic produces prose, not a structured JSON array). Fallback: full critique text when neither section found. The planner reads research artifacts directly and treats feedback as guidance.
3. **Revision counting** — Router counts all `plan.revision-requested` events in the log (auto + user) to derive cycle number. After 3 total revisions, fall through to existing human gate (present REVISE warning with exhaustion note, ask user).
4. **No new events** — All events already exist. Only the router's gate handling logic changes.
5. **`plan.critiqued` not in `EVENT_TO_PHASE`** — Could be added as `"PLAN"` for dashboard accuracy, but is a separate concern.

## Existing Patterns to Follow

### Interview gate auto-pass (SKILL.md lines 83-98)
- Read field from event data (confidence)
- Compare to threshold (>= 95)
- Auto-emit pass event without user interaction
- Otherwise loop with user interaction

This is the exact pattern: read verdict from `plan.critiqued`, auto-emit revision if REVISE, present to user if PASS/PASS WITH CHANGES.

## Constraints
- Agent frontmatter and registry.json must stay in sync (enforced by dev hook)
- Event log is append-only
- Router is the only writer to events.jsonl
- `revisionNumber` must be derived from event log (count plan.revision-requested events)
