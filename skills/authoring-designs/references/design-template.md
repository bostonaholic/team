# Design document template

Use this body for `6-design.md`.

```markdown
# Design: <topic>

## Current state
<2-4 paragraphs describing the subsystem, callers, consumers, and sibling implementations with specific files/functions from 5-research.md>

## Desired end state
<2-4 paragraphs with the same file-level specificity. Add boundary conditions, error paths, and unusual inputs; each item names the scenario and chosen behavior:
- Boundary values: empty, zero, one, max-size, off-by-one.
- Invalid inputs: malformed payloads, wrong types, missing fields.
- Failure paths: downstream errors, timeouts, partial writes, retries.
- Concurrency: simultaneous requests, idempotency, races.
- Authorization: unauthenticated, unauthorized, expired credentials.
- Resource limits: rate exhaustion, quota, memory pressure.
Put intentional deferrals in Out of scope.>

## Patterns to follow
<Existing good patterns with file:line references.>

## Decisions made
<Numbered decisions: decision, alternative, reason, and surfaces that must change together. Derive every closed set by enumeration and record its command. Mark self-resolved choices “Assumption — chosen without user review”.>

## Out of scope
<Specific exclusions.>

## Surfaces
<Include ONLY for multiple entry modes, self-contained paths, turn splits, or procedures reachable without the rest. List surfaces, then map each safeguard:>

| Safeguard | Mode A | Mode B | ... |
|---|---|---|---|
| <rule> | yes | yes | |
| <rule> | yes | no — <why not> | |

<Every `no` states why. A self-contained surface must name what makes that true.>

## Open questions (deferred)
<Low-priority items for structure or implementation.>

## Risks
<One bullet each for compatibility, performance, migration, and operations.>
```
