# Slicing Work Reference

The `7-structure.md` format. Slicing rules live in the [structure playbook](playbooks/structure.md).

A slice is **vertical** if you can demo the change after that slice is done, even if the demo is narrow.

## Structure document format

The body of `7-structure.md`:

```markdown
# Structure: <topic>

## Slices
<numbered list, ordered by execution. Each slice is end-to-end.>

### Slice 1: <name>
**Goal:** <the user-visible behavior this slice ships, in one sentence>
**Repos:** <multi-repo only — comma-separated slugs from 4-repos.md>
**Layers touched:** <e.g., migration, service, API handler, client>
**Tests:** <acceptance tests, chosen through the authoring gate, that prove the
slice done. Each entry reads `name` — <behavior it protects>.
A task-required test that fails the bar keeps its entry and adds
"task-required, fails <class>". Multi-repo: prefix each with `<repo>:`.>
**Verification checkpoint:** <how the human or CI confirms this slice works
before later slices exist>
**Atomic commit message:** <conventional-commit subject. A multi-repo slice
spanning repos uses an **Atomic commit message per repo:** block instead,
one subject per repo.>

### Slice 2: <name>
...

## Cross-slice concerns
<shared types, configuration, feature flags: pull each into the earliest slice
that needs it, or name it here. Multi-repo: name each cross-repo contract and
the slice that defines it.>

## Out of structure
<the design's "out of scope" work, restated so the planner excludes it>
```
