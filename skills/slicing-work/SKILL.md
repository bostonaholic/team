---
name: slicing-work
description: 'Defines vertical slices and verification checkpoints. Load when converting a reviewed design into `7-structure.md`.'
user-invocable: false
---

# Slicing Work

Convert a reviewed design into vertical slices: end-to-end, independently
testable, and atomically committable. Read
[references/structure-template.md](references/structure-template.md) before
writing `7-structure.md`; it owns the exact template and multi-repo fields.

## Slice contract

For each numbered slice record:

- user-visible Goal;
- Repos and Layers touched;
- 1–3 named acceptance Tests, with repo prefixes in multi-repo work;
- an isolated Verification checkpoint;
- one Atomic commit message per affected repo.

Then include:

- `## Cross-slice concerns` for shared types, config, flags, repo contracts,
  and the slice that owns each;
- `## Out of structure` restating design exclusions.

## Rules

- Every slice ends in a passing test or runnable check. Fold scaffolding into
  its first consumer.
- Include designed boundary, invalid-input, failure, concurrency, auth, and
  resource-limit cases. Cite an out-of-scope decision for omissions.
- Order by user value. Slice 1 is the smallest usable behavior or walking
  skeleton, not infrastructure.
- Cite non-obvious design decisions. Name files and behavior, never bodies.
- Keep the structure under about 200 lines; consolidate or reduce scope when
  needed.

## Slicing heuristics

- Slice by user capability, never by technical layer.
- Migrations are never standalone; pair each with its first read/write.
- A multi-repo behavior remains one slice with one atomic commit per repo.
- Define a producer contract before its consumer and cite the defining slice.
- A destructive, irreversible, or externally-visible mutation may deserve its
  own PR. Compare its review cost with the second PR, second land-time bump,
  and dependency cost. State the decision in `## Cross-slice concerns` either
  way.
