---
name: principle-degrade-never-block
description: An optional enhancement never blocks the primary path and never softens the outcome — pointed to by nested-agents, cross-model-review, and tracking-tickets when one is missing.
user-invocable: false
---

# Degrade, Do Not Block

A principle, not a gate. An optional enhancement is an optimization on top of
a path that already works. When it is unavailable — the tool is missing, the
environment cannot reach it, the project defines no mechanism for it — the
primary path continues without it and the run degrades rather than halting.
The other half matters as much: its absence changes nothing about the
outcome's strictness. An enhancement that could soften a verdict when it fails
was never optional.

## What it rules out

- **Halting the primary path on an optional step's failure**, which makes the
  enhancement a dependency and the word "optional" a fiction.
- **Softening a verdict because the enhancement was unavailable.** The
  standard was set by the primary path, and nothing that did not run may lower
  it.
- **Reporting failure on the optional step alone**, when the work the caller
  asked for completed.
- **Skipping the enhancement quietly where its absence is a surprise.** A step
  the procedure declares best-effort may be skipped in silence; one nobody
  declared optional is a failure and is reported.
- **Letting the enhancement's output become load-bearing** — a downstream step
  that only works when the optional pass ran has made it required.

## Boundary

- It reaches optional enhancements only. A verdict, a gate, or a hard
  requirement is not degradable, and treating one as such is the misreading
  this rule most often produces.
- Deciding what counts as optional belongs to the procedure, stated in
  advance. Declaring a step best-effort after it failed is a rationalization.
- It is not a licence for silence on the primary path. A real failure there is
  surfaced, per `principle-fail-loudly`, which this rule bounds rather than
  overrides.

## Where it applies

- `skills/nested-agents/SKILL.md`
- `skills/cross-model-review/SKILL.md`
- `skills/tracking-tickets/SKILL.md`
