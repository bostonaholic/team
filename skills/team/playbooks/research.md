# Research playbook

Before this operation, read [artifact schema](references/artifacts.md).
Resolve links from the installed `skills/team/` directory and read each step's linked rules before it. If a read fails, stop that step and report the resolved path; never use checkout fallback or recursive loading.

Two read-only roles serve RESEARCH: the file-finder locates files; the researcher answers neutral questions with evidence. Both read only `2-questions.md` (and `4-repos.md` when present), never `1-task.md`. Neither writes files.

## File-finder contract

From the `2-questions.md` scope and vocabulary, find every relevant file. In multi-repo mode (`4-repos.md`), repeat each strategy in every listed repo and namespace results by slug.

One finding per line; no blank or separator lines; emit a category heading only when it has findings.

Search strategies, broad to narrow:

1. **Glob by naming convention** (e.g. `**/*auth*`), singular and plural, against each repo's absolute path.
2. **Content search** for vocabulary, functions, classes, errors, and synonyms.
3. **Import/dependency tracing**, forward and reverse, from every relevant file. Record cross-repo imports in `## Notes`.
4. **Directory exploration** of siblings for tests, configuration, and related modules.
5. **Config and manifests**: package manifests, build configuration, and entry points referencing the area.

Search rules:

- Prefer a confirmed extra file over a missed relevant file.
- Try at least three search terms per concept before stopping that direction.
- Never guess paths; report only confirmed files, one factual line each.
- In large codebases, prioritize the `2-questions.md` scope and report unsearched areas.

## Researcher contract

Answer every question in `2-questions.md` with objective, compressed, file-referenced findings, scoped by its `Codebase context` and by repo slug/path in `4-repos.md` when present.

- Every claim comes from code read in this run and cites `file:line`; trace runtime behavior beyond suggestive names ([verified results rules](principles/verified-results.md)).
- Record visible versions per repo.
- Multi-repo: record shared types/API schemas under `## Constraints` and differing conventions under `## Patterns Observed`.
- Choose whatever investigation path answers all questions; never infer the user's goal.

The return is copied unchanged into `5-research.md`. Prefix multi-repo references with the `4-repos.md` slug, e.g. `frontend:src/App.tsx:42`.

```markdown
## Tech Stack
- Language, framework, key libraries, versions; per repo when needed

## Directory Conventions
- Organization and file placement; per repo when needed

## Answers to Questions
### Q1: <restate question>
<answer with file:line references>
...

## Patterns Observed
- Similar implementations, error handling, naming

## Test Patterns
- Framework, assertions, test locations, fixtures/helpers

## Reusable Components
- Existing utilities, helpers, abstractions, shared types/interfaces

## Constraints
- Hard contracts/schemas/API compatibility; soft conventions

## Open Questions
- Ambiguity the design-author must resolve
```

Reporting rules:

- Report what IS, never what SHOULD BE or recommended approaches ([independent review rules](principles/independent-review.md)).
- Compress without generalizing: keep function names, type signatures, and paths.
- Return underspecified questions in `## Open Questions`; never guess.

## System dependency checks

Per `## When researching` of [system dependency checks](references/dependencies.md), map the callers, consumers, siblings, and conventions of each component an answer touches — as facts about the code, never inferred intent.
