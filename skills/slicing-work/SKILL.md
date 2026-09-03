---
name: slicing-work
description: Turn a reviewed design into independently testable vertical slices in 7-structure.md.
user-invocable: false
---

# Slicing Work

## Input

Read the reviewed design and optional `4-repos.md`. Split it into sequential,
end-to-end behavior increments, not technical layers.

## Required output

Write `7-structure.md`:

```markdown
# Structure: <topic>
## Slices
### Slice 1: <name>
**Goal:** <user-visible behavior>
**Repos:** <multi-repo only>
**Layers touched:** <all needed layers>
**Tests:** <1–3 acceptance tests; prefix repo when multi-repo>
**Verification checkpoint:** <isolated proof>
**Atomic commit message:** <subject per repo>

## Cross-slice concerns
<shared types/config/contracts, owning slice, and own-PR decision>

## Out of structure
<design's out-of-scope work>
```

## Required decisions

- Each slice must end with a passing test or runnable check and leave no
  caller or repo broken.
- Pull relevant boundary, invalid-input, failure, concurrency, authorization,
  and resource-limit cases from the design into the slice that ships them.
- Put the smallest user-visible behavior first. Fold migrations and other
  scaffolding into their first consumer.
- Cite non-obvious design decisions; include no implementation code.
- A multi-repo slice may span repos; define contracts before consumers and
  create one atomic commit per repo.
- Stay under about 200 lines; reduce slices or move work out of scope.

A destructive, irreversible, or externally visible mutation may need its own
PR. Weigh that review cost against the cost and dependency of multiple PRs.
Record the decision either way in `## Cross-slice concerns`.

## Done

Every slice is independently verifiable, atomically committable, and useful.
