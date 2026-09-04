---
name: researching-codebases
description: 'Defines evidence-only codebase research and `5-research.md`. Load when answering neutral questions before design.'
user-invocable: false
---

# Researching Codebases

Answer every neutral question in `2-questions.md` with objective, compressed, file-referenced findings. Scope by its `Codebase context` and by repo slug/path in `4-repos.md` when present.

## Investigation contract

- Every claim comes from code read in this run and cites `file:line`; trace runtime behavior beyond suggestive names (`principle-evidence-over-assertion`).
- Record visible versions per repo, for example `frontend: React 18; api: Go 1.22`.
- In multi-repo mode, record shared types/API schemas under `## Constraints` and differing conventions under `## Patterns Observed`.
- Choose the investigation path needed to answer all questions; never infer the user's goal.

## Output format

Keep `docs/plans/<id>/5-research.md` under 100 lines, or under 150 for multi-repo output. Prefix multi-repo references with the `4-repos.md` slug, e.g. `frontend:src/App.tsx:42`.

```markdown
## Tech Stack
- Language, framework, key libraries, visible versions; per repo when needed

## Directory Conventions
- Organization and file placement; one bullet per repo when needed

## Answers to Questions
### Q1: <restate question>
<answer with file:line references>
### Q2: <restate question>
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

## Reporting rules

- Report what IS, never what SHOULD BE or recommended approaches (`principle-blind-the-investigator`).
- Compress without generalizing: retain function names, type signatures, and paths; delete prose without information.
- If over budget, remove the least information-dense material.
- Return underspecified questions in `## Open Questions`; never guess.
