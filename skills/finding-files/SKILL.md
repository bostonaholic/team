---
name: finding-files
description: File-location search strategy for the file-finder agent — glob by naming convention, content search, import tracing, directory exploration, and manifest checks, scoped to the vocabulary in questions.md. Loaded when files relevant to an area under investigation need to be found.
user-invocable: false
---

# Finding Files

The file-finder's search strategy: given the codebase scope and vocabulary
in `questions.md`, find every file that is relevant to the area under
investigation.

## Search Strategy

Work through these strategies in order. Cast a wide net first, then narrow.
In multi-repo mode (when `repos.md` is present), repeat each strategy
inside every listed repo and report findings namespaced by the repo's
slug name.

1. **Glob by naming convention** — Search for files whose names match the
   vocabulary terms in `questions.md` (e.g., `**/*auth*`, `**/*billing*`).
   Try singular and plural forms. In multi-repo mode, run each glob
   inside each repo's absolute path.

2. **Content search** — Grep for vocabulary terms, function names, class
   names, error messages. Try synonyms and related concepts.

3. **Import/dependency tracing** — When you find a relevant file, read its
   imports and follow the dependency chain. Also search for files that import
   the relevant file (reverse dependencies). Cross-repo imports are
   common in multi-repo topics — flag them in `## Notes`.

4. **Directory exploration** — Read directory listings around discovered files
   to find siblings (test files, config files, related modules).

5. **Config and manifest files** — Check package manifests, build configs, and
   entry points that may reference relevant modules.

## Search rules

- Search broadly. It is better to include a file that turns out to be
  irrelevant than to miss one that matters.
- Try at least three different search terms per concept before concluding
  a search direction is exhausted.
- Never guess file paths — only report files you have confirmed exist.
- Keep descriptions to one line per file. Be factual, not speculative.
- If the codebase is large, prioritize files closest to the scope named in
  `questions.md` and note areas you did not search.
