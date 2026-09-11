---
name: finding-files
description: 'Locates files by naming, structure, and imports. Load for read-only discovery when exact paths are unknown.'
user-invocable: false
---

# Finding Files

Given `2-questions.md` codebase scope and vocabulary, find every relevant file. In multi-repo mode from `4-repos.md`, repeat each strategy in every listed repo and namespace results by slug.

Return at most 40 physical lines, or 60 in multi-repo mode. Terminal empty or
whitespace-only lines count toward the limit. Keep one finding per line so the
Research assembler can preserve the return unchanged. Write no blank or
separator lines; emit a category heading only when it has findings.

## Search Strategy

Use these in order, broad to narrow:

1. **Glob by naming convention.** Search vocabulary terms such as `**/*auth*` and `**/*billing*`; try singular/plural. Run against each repo's absolute path.
2. **Content search.** Grep vocabulary, functions, classes, errors, synonyms, and related concepts.
3. **Import/dependency tracing.** Follow imports and reverse dependencies from every relevant file. Record cross-repo imports in `## Notes`.
4. **Directory exploration.** Inspect siblings for tests, configuration, and related modules.
5. **Config and manifests.** Inspect package manifests, build configuration, and entry points referencing the area.

## Search rules

- Prefer a confirmed extra file over a missed relevant file.
- Try at least three search terms per concept before stopping that direction.
- Never guess paths; report only confirmed files.
- Use one factual, non-speculative line per file.
- In large codebases, prioritize the `2-questions.md` scope and report unsearched areas.
