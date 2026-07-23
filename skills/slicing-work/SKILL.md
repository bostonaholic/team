---
name: slicing-work
description: Vertical-slice breakdown methodology for the structure-planner agent — the rationale for vertical slices, the structure.md document format, the slicing rules, and the slicing heuristics. Loaded when an approved design is broken into independently testable slices.
user-invocable: false
---

# Slicing Work

The structure-planner's methodology: break an approved design into vertical
slices, each end-to-end, independently testable, and atomically committable.

## Why vertical slices

Models love to write horizontal plans: all the migrations, then all the APIs,
then all the UI. By the time everything is wired together, 1200 lines of
code exist with nothing testable between them. Structure forces the opposite:
each slice exercises every layer it needs and ships behavior, not infrastructure.

A slice is **vertical** if you can demo the change after that slice is done,
even if the demo is narrow.

## Structure document format

The body of `structure.md`:

```markdown
# Structure: <topic>

## Slices
<numbered list, ordered by execution. Each slice is end-to-end.>

### Slice 1: <name>
**Goal:** <one sentence describing the user-visible behavior this slice ships>
**Repos:** <multi-repo only — comma-separated repo slugs from repos.md
that this slice touches; e.g. `frontend, api`>
**Layers touched:** <e.g., migration, repository, service, API handler, client>
**Tests:** <list of acceptance test names that prove this slice is done.
In multi-repo mode prefix each with `<repo>:` to say where it lives.>
**Verification checkpoint:** <how the human or CI confirms this slice works in
isolation, even if later slices are not yet written>
**Atomic commit message:** <conventional-commit subject for this slice.
In multi-repo mode, if the slice spans repos, use a separate
**Atomic commit message per repo:** block listing one subject per repo.>

### Slice 2: <name>
...

## Cross-slice concerns
<things that span slices — shared types, configuration, feature flags. Each
should be either pulled into the earliest slice that needs it, or called out
explicitly. In multi-repo mode, contracts between repos (API schemas,
shared types, protobufs) are common cross-slice concerns — name the
contract and the slice that defines it.>

## Out of structure
<work the design called out as "out of scope" — restated here so the planner
does not accidentally include it>
```

## Rules

- **Every slice ends in a passing test.** If a slice cannot be demonstrated
  with a test (or a manually-runnable check), it is infrastructure scaffolding
  — fold it into the next slice.
- **Each slice has 1–3 acceptance tests.** A slice with 10 tests is too big.
  A slice with 0 tests is too horizontal.
- **Acceptance tests cover edge cases, not just happy paths.** Pull the
  relevant scenarios from `design.md`'s `## Edge cases` section into the
  slice that ships that behavior — boundary values, invalid inputs,
  failure paths, concurrency, auth, and resource limits. A slice whose
  test list reads as happy-path only is incomplete; either add the
  missing edge-case tests or, if the design declared them out of scope,
  cite that decision in the slice notes.
- **Order by user value.** First slice should ship the smallest piece of
  user-visible behavior. Pure-infrastructure slices push integration risk to
  the end — that is the failure mode QRSPI exists to prevent.
- **Reference design decisions.** When a slice's approach is non-obvious, cite
  the design decision that justified it.
- **No implementation code.** Slice descriptions name files and behaviors,
  not function bodies.
- **Stay under ~200 lines.** If you need more, you have too many slices —
  consolidate, or push some out of scope and re-approve the design.

## Heuristics for slicing

- **Slice by user-facing capability**, not by technical layer. "Add the
  endpoint and return mocked data" is a valid first slice; "add all
  database migrations" is not.
- **Walking-skeleton first**: if there is a new flow that does not exist
  yet, slice 1 should be the thinnest end-to-end version (mock or hardcoded
  internals are fine, but the user-visible surface must work).
- **Migrations alone are never a slice.** A migration without a consumer is
  infrastructure scaffolding. Pair it with the read/write that uses it.
- **Multi-repo: a slice may span repos.** A vertical slice that needs
  the API and the UI shipped together to demo is one slice that touches
  two repos, not two slices. Record this in the slice's `**Repos:**`
  field and produce one atomic commit per repo (each commit is its
  own atomic unit; the slice as a whole ships when both commits land).
- **Multi-repo: contract-first when ordering matters.** If repo A's
  consumer depends on repo B's contract, the slice that defines the
  contract goes first, and the slice that consumes it cites it.
