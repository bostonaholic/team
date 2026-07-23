---
name: researching-codebases
description: Codebase research procedure for the researcher agent — the investigation method (trace, pattern recognition, constraint discovery) and the compressed research-report output format. Loaded when neutral research questions need factual, file-referenced answers.
user-invocable: false
---

# Researching Codebases

The researcher's procedure: answer a list of neutral research questions
with compressed, objective, file-referenced findings.

## Investigation method

1. **Read the questions.md "Codebase context" section.** Note the scope
   (directory paths, modules) and the vocabulary it defines. If
   `repos.md` is present, also note the repo slugs and absolute paths.
2. **Read the questions.** For each, identify the file paths or modules
   where the answer would live. In multi-repo mode, also identify which
   repo each question targets.
3. **Trace.** Follow the execution path: entry point → handler → service →
   data layer. Read imports, follow calls, note boundaries. In
   multi-repo mode, follow contracts that cross repo boundaries
   (shared types, API schemas) and report them in `## Constraints`.
4. **Pattern recognition.** Identify recurring patterns: naming conventions,
   error handling style, test structure, module organization. In
   multi-repo mode, note where conventions differ between repos.
5. **Constraint discovery.** Find things that will constrain implementation:
   type definitions, validation rules, database schemas, API contracts,
   environment requirements.

## Output format

Report findings in this structure. Keep the entire report under 100
lines (under 150 in multi-repo mode — extra budget for the per-repo
sections). The orchestrator writes the findings to
`docs/plans/<id>/research.md`.

In multi-repo mode, prefix every file reference with the repo slug,
e.g. `frontend:src/App.tsx:42`. The slug is the `name` field from the
matching entry in `repos.md`.

```
## Tech Stack
- Language, framework, key libraries with versions if visible
  (multi-repo: list per repo, e.g. "frontend: React 18; api: Go 1.22")

## Directory Conventions
- How the codebase is organized, where things go
  (multi-repo: one bullet per repo)

## Answers to Questions
### Q1: <restate question>
<answer with file:line references>

### Q2: <restate question>
<answer with file:line references>
...

## Patterns Observed
- How the codebase implements similar concerns
- Error handling conventions
- Naming conventions

## Test Patterns
- Test framework and assertion style
- Test file location convention
- Fixture/helper patterns

## Reusable Components
- Existing utilities, helpers, or abstractions
- Shared types or interfaces

## Constraints
- Hard constraints (type contracts, schema requirements, API compatibility)
- Soft constraints (conventions worth following for consistency)

## Open Questions
- Anything ambiguous that the design-author should resolve with the user
```

## Reporting rules

- **Objective findings only.** Report what IS, not what SHOULD BE. Do not
  recommend approaches.
- **Compress, do not summarize.** Include specific function names, type
  signatures, and file paths. Omit prose that does not carry information.
- **Stay under 100 lines.** If you need more space, cut the least
  information-dense sections.
- If a question feels under-specified, return it in the `## Open Questions`
  section rather than guessing what the questioner meant.
