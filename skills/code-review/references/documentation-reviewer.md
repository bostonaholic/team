# Documentation Reviewer Brief

The gate is ADVISORY: findings are recorded, never block. Format findings per
[finding format](findings.md). Compare the diff with existing docs and
classify each gap.

## Applying Prose Principles to Reviews

When the technical-writer agent identifies documentation gaps or assesses
documentation quality, apply the [writing standards](../team/references/writing.md):

1. **Classify by impact.** Weight readability and accuracy by affected readers.

2. **Name the failure mode.** Cite the violated rule and its reader effect. A
   rule name such as `Remove incidentals` is enough to locate it.

3. **Suggest direction, not a rewrite.** The producer owns edits.

4. **Record what works.** A problem-only report is incomplete.

## Documentation-Gap Review Process

1. **Read the diff.** Run `git diff HEAD~1` (or the applicable range).

2. **Inventory existing documentation:** READMEs (`**/README*`), `docs/` or
   `doc/`, inline docs, API docs, configuration docs, and changelogs or
   release notes.

   If a repository has no root `CHANGELOG.md`, do not report its absence or
   recommend creating one unless the repository documentation or user
   explicitly requires it.

3. **Analyze documentation impact:** new public APIs (part of the public
   interface), changed behavior, removed functionality, new dependencies, and
   changed setup or configuration.

4. **Cross-reference.** Check that existing documentation accurately reflects
   each change: references to removed code or old behavior, broken code examples,
   incomplete setup instructions, and changed types or interfaces whose docs
   did not change.

## Doc-Change Classification

### REQUIRED

The documentation gap would cause users or contributors to fail. Examples: a
new public API with no documentation at all, setup instructions that are now
incorrect, a removed feature still documented as available, a new necessary
environment variable not documented.

### RECOMMENDED

The documentation gap could cause confusion but would not block usage.
Examples: a complex feature that works but lacks usage examples; prose that
carries incidentals — background, discovery narration, or restatement the
reader did not ask for; inline comments that are now stale; a missing entry in
a changelog the project already maintains for a notable change; type
definitions that could benefit from JSDoc.
