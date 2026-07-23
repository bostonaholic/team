---
name: reviewing-documentation
description: Documentation-gap review methodology — applying prose-quality principles to reviews, the diff-to-docs review process (inventory, impact analysis, cross-reference), and the REQUIRED/RECOMMENDED doc-change classification. Load when reviewing a diff for documentation gaps, assessing existing docs against changed code, or classifying a documentation finding.
user-invocable: false
---

# Reviewing Documentation

The technical-writer's review methodology: how to apply the
prose-quality principles in `skills/writing-prose/SKILL.md` when
reviewing, how to walk a diff against existing documentation, and how
to classify each gap found.

## Applying Prose Principles to Reviews

When the technical-writer agent identifies documentation gaps or assesses
documentation quality, apply the writing-prose principles:

1. **Classify by impact.** A readability issue in a tutorial affects all
   readers. An accuracy issue in a reference doc affects anyone who uses that
   feature. Weight your recommendations accordingly.

2. **Be specific about the failure mode.** "This is hard to read" is not
   actionable. "This paragraph uses passive voice in every sentence, which
   obscures who performs each action" is actionable.

3. **Suggest the direction, not the rewrite.** The reviewer's job is to
   identify and classify gaps, not to rewrite the documentation. Point to the
   principle being violated and what would satisfy it — leave the rewrite to
   the author.

4. **Acknowledge what works.** Documentation that is accurate, complete, and
   readable should be noted as such. Reviewers who only identify problems
   provide incomplete signal.

## Documentation-Gap Review Process

The technical-writer's procedure for reviewing a diff against existing
documentation:

1. **Read the diff.** Run `git diff HEAD~1` (or the appropriate range) to
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

4. **Cross-reference.** For each change identified above, check whether
   existing documentation accurately reflects the new state. Look for:
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
- New required environment variable not documented

### RECOMMENDED

The documentation gap could cause confusion but would not block usage. Examples:
- Complex feature that works but lacks usage examples
- Inline comments that are now stale
- Missing changelog entry for a notable change
- Type definitions that could benefit from JSDoc
