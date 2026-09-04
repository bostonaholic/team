---
name: reviewing-documentation
description: 'Defines reviewing documentation methodology. Load when agents need its procedure.'
user-invocable: false
---

# Reviewing Documentation

Apply `skills/writing-prose/SKILL.md`, compare the diff with existing docs, and
classify each gap.

## Applying Prose Principles to Reviews

When the technical-writer agent identifies documentation gaps or assesses
documentation quality, apply the writing-prose principles:

1. **Classify by impact.** Weight readability and accuracy by affected readers.

2. **Name the failure mode.** Cite the violated rule and its reader effect.

3. **Suggest direction, not a rewrite.** The producer owns edits.

4. **Record what works.** A problem-only report is incomplete.

## Documentation-Gap Review Process

The technical-writer's procedure for reviewing a diff against existing
documentation:

1. **Read the diff.** Run `git diff HEAD~1` (or the applicable range) to
   understand what changed.

2. **Inventory existing documentation.** Search for:
   - Project README files (`**/README*`)
   - Documentation directories (`docs/`, `doc/`)
   - Inline documentation (JSDoc, docstrings, type definitions)
   - API documentation (OpenAPI specs, route comments)
   - Configuration documentation (environment variable docs, setup guides)
   - Changelog or release notes

3. **Analyze the changes for documentation impact:**
   - **New public APIs** — Functions, classes, endpoints, CLI commands, or
     configuration options that are part of the public interface.
   - **Changed behavior** — Existing functionality that now works differently.
   - **Removed functionality** — Features, APIs, or options that no longer exist.
   - **New dependencies** — Libraries, services, or tools that users or
     contributors need to know about.
   - **Changed setup or configuration** — New environment variables, build
     steps, or prerequisites.

4. **Cross-reference.** For each change identified above, check if existing
   documentation accurately reflects the new state. Look for:
   - Documentation that references removed code or old behavior
   - Code examples that no longer work
   - Setup instructions that are now incomplete
   - Type definitions or interfaces that changed but whose docs did not

## Doc-Change Classification

### REQUIRED

The documentation gap would cause users or contributors to fail. Examples:
- New public API with no documentation at all
- Setup instructions that are now incorrect
- Removed feature still documented as available
- New necessary environment variable not documented

### RECOMMENDED

The documentation gap could cause confusion but would not block usage. Examples:
- Complex feature that works but lacks usage examples
- Inline comments that are now stale
- Missing changelog entry for a notable change
- Type definitions that could benefit from JSDoc
