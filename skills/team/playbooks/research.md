# Research playbook

Before this operation, read [artifact schema](references/artifacts.md).
Before each consuming step, read its linked shared rules. Resolve links from this installed playbook directory.
If a required read fails, stop that step and report its resolved path. Never use checkout fallback or recursive loading.

Two read-only roles serve RESEARCH. The file-finder locates files; the researcher answers neutral questions with evidence. Both read only `2-questions.md` (and `4-repos.md` when present), never `1-task.md`. Neither writes files.

## File-finder contract

Given `2-questions.md` codebase scope and vocabulary, find every relevant file. In multi-repo mode from `4-repos.md`, repeat each strategy in every listed repo and namespace results by slug.

Return at most 40 physical lines, or 60 in multi-repo mode. Terminal empty or whitespace-only lines count toward the limit. Keep one finding per line so the Research assembler can preserve the return unchanged. Write no blank or separator lines; emit a category heading only when it has findings.

Search strategies, broad to narrow:

1. **Glob by naming convention.** Search vocabulary terms such as `**/*auth*` and `**/*billing*`; try singular/plural. Run against each repo's absolute path.
2. **Content search.** Grep vocabulary, functions, classes, errors, synonyms, and related concepts.
3. **Import/dependency tracing.** Follow imports and reverse dependencies from every relevant file. Record cross-repo imports in `## Notes`.
4. **Directory exploration.** Inspect siblings for tests, configuration, and related modules.
5. **Config and manifests.** Inspect package manifests, build configuration, and entry points referencing the area.

Search rules:

- Prefer a confirmed extra file over a missed relevant file.
- Try at least three search terms per concept before stopping that direction.
- Never guess paths; report only confirmed files.
- Use one factual, non-speculative line per file.
- In large codebases, prioritize the `2-questions.md` scope and report unsearched areas.

## Researcher contract

Answer every neutral question in `2-questions.md` with objective, compressed, file-referenced findings. Scope by its `Codebase context` and by repo slug/path in `4-repos.md` when present.

Investigation contract:

- Every claim comes from code read in this run and cites `file:line`; trace runtime behavior beyond suggestive names ([verified results rules](principles/verified-results.md)).
- Record visible versions per repo, for example `frontend: React 18; api: Go 1.22`.
- In multi-repo mode, record shared types/API schemas under `## Constraints` and differing conventions under `## Patterns Observed`.
- Choose the investigation path needed to answer all questions; never infer the user's goal.

Return at most 60 physical lines, or 100 in multi-repo mode. Terminal empty or whitespace-only lines count toward the limit. The assembler keeps this return unchanged inside a labeled, untrusted-evidence fence in `5-research.md`. Prefix multi-repo references with the `4-repos.md` slug, e.g. `frontend:src/App.tsx:42`.

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

Reporting rules:

- Report what IS, never what SHOULD BE or recommended approaches ([independent review rules](principles/independent-review.md)).
- Compress without generalizing: retain function names, type signatures, and paths; delete prose without information.
- If over budget, remove the least information-dense material.
- Return underspecified questions in `## Open Questions`; never guess.

## System dependency checks

Per `## When researching` of [system dependency checks](references/dependencies.md), map the callers, consumers, siblings, and conventions of each component an answer touches — as facts about the code, never as inferred intent.
