# Slicing Work Reference

A slice is **vertical** if you can demo the change after that slice is done,
even if the demo is narrow.

## Structure document format

The body of `7-structure.md`:

```markdown
# Structure: <topic>

## Slices
<numbered list, ordered by execution. Each slice is end-to-end.>

### Slice 1: <name>
**Goal:** <one sentence describing the user-visible behavior this slice ships>
**Repos:** <multi-repo only — comma-separated repo slugs from 4-repos.md
that this slice touches; e.g. `frontend, api`>
**Layers touched:** <e.g., migration, repository, service, API handler, client>
**Tests:** <list of acceptance test names that prove this slice is done.
In multi-repo mode prefix each with `<repo>:` to say where it lives.>
**Verification checkpoint:** <how the human or CI makes sure this slice works in
isolation, even if later slices are not yet written>
**Atomic commit message:** <conventional-commit subject for this slice.
In multi-repo mode, if the slice spans repos, use a separate
**Atomic commit message per repo:** block listing one subject per repo.>

### Slice 2: <name>
...

## Cross-slice concerns
<things that span slices (shared types, configuration, feature flags): pull
each into the earliest slice that needs it, or call it out explicitly. In
multi-repo mode, name each contract between repos (API schemas, shared types,
protobufs) and the slice that defines it.>

## Out of structure
<the design's "out of scope" work, restated so the planner does not
accidentally include it>
```

## Rules

- Pull edge cases from `6-design.md`'s `## Edge cases` section into the slice
  that ships that behavior. A happy-path-only test list is incomplete: add the
  missing edge-case tests or, if the design declared them out of scope, cite
  that decision in the slice notes.
- Over ~200 lines means too many slices: consolidate, or push some out of
  scope and run a fresh design review.
- Walking skeleton: for a new flow, slice 1 is the thinnest end-to-end
  version; mock or hardcoded internals are fine, but the user-visible surface
  must work.
- Multi-repo: a slice that needs the API and the UI shipped together to demo is
  one slice touching two repos, not two slices. Record them in its
  `**Repos:**` field and produce one atomic commit per repo; the slice as a
  whole ships when both commits land.
