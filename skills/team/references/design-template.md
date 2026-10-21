# Design document template

Use this body for `6-design.md`. Read [design playbook](playbooks/design.md) for the authoring procedure.

```markdown
# Design: <topic>

## Current state
<2-4 paragraphs: the subsystem, callers, consumers, and sibling implementations, with specific files/functions from 5-research.md>

## Desired end state
<2-4 paragraphs, same file-level specificity. Each edge case names the scenario and chosen behavior across boundary values (empty, zero, one, max, off-by-one), invalid inputs, failure paths (downstream errors, timeouts, partial writes, retries), concurrency (idempotency, races), authorization, and resource limits. Put intentional deferrals in Out of scope.>

## Caller examples
<ONLY when the change introduces or alters a shared interface — an entry point, route, command, function, or file or procedure another component reads or invokes. Actual caller usage (a real user prompt, call, or read) and the expected outcome. For Team: real user prompts, each naming the expected dispatch, resource reads, artifacts written, and stop condition.>

## Interface
<ONLY when Caller examples is present. Inputs, outputs, errors, and ownership — who creates, owns, mutates, and cleans up each resource. Enumerate boundary values, invalid inputs, and failure paths here or in Desired end state.>

## Patterns to follow
<Existing good patterns with file:line references.>

## Decisions made
<Numbered decisions: decision, each serious alternative and why it lost, the chosen approach's risk and mitigation, and the surfaces that must change together. Record the enumeration command for every closed set. Mark self-resolved choices "Assumption — chosen without user review".>

## Experiments
<ONLY when an unresolved question is answerable by observation. One record per question with all five fields: Question, Alternatives, Experiment, Observation, Decision.>

## Out of scope
<Specific exclusions, including work a reader might assume is included.>

## Surfaces
<ONLY for multiple entry modes, self-contained paths, turn splits, or procedures reachable without the rest. List surfaces, then map each safeguard:>

| Safeguard | Mode A | Mode B | ... |
|---|---|---|
| <rule> | yes | yes | |
| <rule> | yes | no — <why not> | |

<Every `no` states why. A self-contained surface names what makes that true.>

## Open questions (deferred)
<Low-priority items for structure or implementation.>

## Risks
<One bullet each for compatibility, performance, migration/rollout, and operations, plus each metric or log that confirms the change works in production.>
```
