---
name: finding-files
description: Find codebase files from neutral 2-questions.md vocabulary. Loaded by file-finder.
user-invocable: false
---

# Finding Files

## Input

Read the scope and vocabulary in `2-questions.md`. If `4-repos.md` exists,
search every listed repo and namespace results by repo slug.

## Required search

1. Glob filenames using each term, synonyms, and singular/plural forms.
2. Search contents for terms, symbols, and error messages.
3. Trace imports and reverse imports.
4. Inspect sibling directories for tests, config, and related modules.
5. Inspect manifests, build configuration, and entry points.

Try at least three terms per concept. Search broadly, but prioritize the named
scope in large repos and report what remains unsearched.

## Output

Report only confirmed paths, one factual line per file. Put cross-repo imports
and other qualifications in `## Notes`; never guess a path.
