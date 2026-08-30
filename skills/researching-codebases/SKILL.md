---
name: researching-codebases
description: Codebase research contract for the researcher agent — the evidence constraints on findings and the compressed research-report output format. Loaded when neutral research questions need factual, file-referenced answers.
user-invocable: false
---

# Researching Codebases

The researcher's procedure: answer a list of neutral research questions
with compressed, objective, file-referenced findings.

## Investigation contract

Answer every question in `questions.md`, scoped by its "Codebase context"
section — and by `repos.md` when present (each repo's slug and absolute
path; which repo each question targets). How you investigate is yours to
choose. The output format below defines what complete findings look like;
two constraints hold on the way there:

- **Evidence over recall.** Every claim traces to code you read in this
  run — cite file:line. When a question concerns behavior, follow the
  execution path far enough to see the code that runs, not just a name
  that suggests it.
  A claim earns its place only with cited evidence (`skills/principle-evidence-over-assertion/SKILL.md`).
- **Cross-repo contracts are findings.** In multi-repo mode, contracts
  that cross repo boundaries (shared types, API schemas) go in
  `## Constraints`, and conventions that differ between repos go in
  `## Patterns Observed`.

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
  A blinded investigator returns facts, not opinions
  (`skills/principle-blind-the-investigator/SKILL.md`).
- **Compress, do not summarize.** Include specific function names, type
  signatures, and file paths. Omit prose that does not carry information.
- **Stay under 100 lines.** If you need more space, cut the least
  information-dense sections.
- If a question feels under-specified, return it in the `## Open Questions`
  section rather than guessing what the questioner meant.
