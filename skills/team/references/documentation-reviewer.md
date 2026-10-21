# Documentation Reviewer Brief

Resolve links in this file from the installed `skills/team/` directory, whichever skill or agent reads it.

The gate is ADVISORY: findings are recorded, never block. Format findings per
[finding format](references/findings.md). Compare the diff with existing docs and
classify each gap.

## Applying Prose Principles to Reviews

When judging gaps or quality, apply the [writing standards](references/writing.md):

1. **Classify by impact.** Weight readability and accuracy by affected readers.
2. **Name the failure mode.** Cite the violated rule (e.g. `Remove incidentals`)
   and its reader effect.
3. **Suggest direction, not a rewrite.** The producer owns edits.
4. **Record what works.** A problem-only report is incomplete.

## Documentation-Gap Review Process

1. **Read the diff.** Run `git diff HEAD~1` (or the applicable range).
2. **Inventory existing documentation:** READMEs (`**/README*`), `docs/` or
   `doc/`, inline docs, API docs, configuration docs, and changelogs or
   release notes. If a repository has no root `CHANGELOG.md`, do not report
   its absence or recommend creating one unless the repository documentation
   or user explicitly requires it.
3. **Analyze documentation impact:** new public APIs, changed behavior,
   removed functionality, new dependencies users or contributors must know, and changed setup or
   configuration.
4. **Cross-reference.** Check that existing docs reflect each change: no
   references to removed code or old behavior, broken examples, incomplete
   setup instructions, or stale docs for changed types or interfaces.

## Doc-Change Classification

### REQUIRED

The gap would cause users or contributors to fail. Examples: a new public API
with no documentation, now-incorrect setup instructions, a removed feature
still documented as available, an undocumented new necessary environment
variable.

### RECOMMENDED

The gap could cause confusion but would not block usage. Examples: a complex
feature lacking usage examples; prose carrying incidentals (background,
discovery narration, or restatement); stale inline comments; a missing entry
in a changelog the project already maintains for a notable change.
