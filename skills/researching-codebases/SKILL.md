---
name: researching-codebases
description: Answer neutral 2-questions.md with factual file:line evidence in 5-research.md. Loaded by researcher.
user-invocable: false
---

# Researching Codebases

## Input

Answer every neutral question in `2-questions.md`. Respect its Codebase context
and every repo in `4-repos.md`, when present.

## Required investigation

- Cite `file:line` from code read during this run for every claim.
- Follow behavior to executable code; names alone are not evidence.
- Report facts, not recommendations. Put ambiguity in `## Open Questions`.
- In multi-repo mode, prefix citations with `<repo>:`; put cross-repo
  contracts in Constraints and divergent conventions in Patterns Observed.
- Apply `skills/principle-evidence-over-assertion/SKILL.md` and
  `skills/principle-blind-the-investigator/SKILL.md`.

## Output

The orchestrator writes this report to `docs/plans/<id>/5-research.md`:

```markdown
## Tech Stack
## Directory Conventions
## Answers to Questions
### Q1: <question>
<answer with file:line evidence>
## Patterns Observed
## Test Patterns
## Reusable Components
## Constraints
## Open Questions
```

Use specific symbols, types, and paths. Stay under 100 lines, or 150 in
multi-repo mode; delete low-information prose first.

## Done

Every question has an evidenced answer or an explicit open question.
