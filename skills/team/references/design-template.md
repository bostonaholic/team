# Design document template

Use this body for `6-design.md`. Read [design playbook](playbooks/design.md) for the authoring procedure.

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

## Caller examples
<Include ONLY when the change introduces or alters a shared interface — an entry point, route, command, function, file another component reads, or procedure another component invokes. Start here, before internal detail: show the actual caller usage — a real user prompt, call, or read — and the expected outcome. For Team, the callers are real user prompts; each example names the expected dispatch, resource reads, artifacts written, and stop condition.>

## Interface
<Include ONLY when Caller examples is present. State the contract before the internals: inputs, outputs, errors, and ownership — who creates, owns, mutates, and cleans up each resource. Enumerate boundary values, invalid inputs, and failure paths here or in Desired end state.>

## Patterns to follow
<Existing good patterns with file:line references.>

## Decisions made
<Numbered decisions: decision, each serious alternative and why it lost, the chosen approach's risk and mitigation, and the surfaces that must change together. Derive every closed set by enumeration and record its command. Mark self-resolved choices "Assumption — chosen without user review".>

## Experiments
<Include ONLY when an unresolved question is answerable by observation and a disposable prototype can settle it. One record per question, with all five fields: Question, Alternatives, Experiment, Observation, Decision. Run each alternative on matching inputs and record the observed result. Prototype code is disposable scratch — never promoted into production without the normal implementation checks (test-first, independent review), and never the authority that approves the design.>

## Out of scope
<Specific exclusions: non-goals, excluded stories, and work a reader might otherwise assume is included.>

## Surfaces
<Include ONLY for multiple entry modes, self-contained paths, turn splits, or procedures reachable without the rest. List surfaces, then map each safeguard:>

| Safeguard | Mode A | Mode B | ... |
|---|---|---|
| <rule> | yes | yes | |
| <rule> | yes | no — <why not> | |

<Every `no` states why. A self-contained surface must name what makes that true.>

## Open questions (deferred)
<Low-priority items for structure or implementation.>

## Risks
<One bullet each for compatibility, performance, migration/rollout, and operations, plus each metric or log that confirms the change works in production.>
```
